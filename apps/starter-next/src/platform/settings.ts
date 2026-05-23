import { SettingsRegistry } from "@universal-admin/core";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";

export const settingsRegistry = new SettingsRegistry();
const generatedModulesDirCandidates = [
  path.resolve(process.cwd(), "src/platform/generated"),
  path.resolve(process.cwd(), "apps/starter-next/src/platform/generated")
];

let initializationPromise: Promise<void> | null = null;

type JsonSchemaProperty = {
  type?: string;
  enum?: unknown[];
  default?: unknown;
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  items?: JsonSchemaProperty;
  properties?: Record<string, JsonSchemaProperty>;
  required?: string[];
};

export interface SettingsSchemaFieldDescriptor {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "object" | "unknown";
  required: boolean;
  enumValues?: string[];
  min?: number;
  max?: number;
  defaultValue?: unknown;
}

export interface SettingsSchemaCatalogEntry {
  moduleId: string;
  schemaVersion: number;
  fields: SettingsSchemaFieldDescriptor[];
}

function applyNumericConstraints(
  schema: z.ZodNumber,
  property: JsonSchemaProperty
): z.ZodNumber {
  let constrained = schema;
  if (typeof property.minimum === "number") {
    constrained = constrained.min(property.minimum);
  }
  if (typeof property.maximum === "number") {
    constrained = constrained.max(property.maximum);
  }
  return constrained;
}

function applyStringConstraints(
  schema: z.ZodString,
  property: JsonSchemaProperty
): z.ZodString {
  let constrained = schema;
  if (typeof property.minLength === "number") {
    constrained = constrained.min(property.minLength);
  }
  if (typeof property.maxLength === "number") {
    constrained = constrained.max(property.maxLength);
  }
  return constrained;
}

function jsonSchemaPropertyToZod(property: JsonSchemaProperty): z.ZodTypeAny {
  if (Array.isArray(property.enum) && property.enum.length > 0) {
    const enumValues = property.enum.filter(
      (value): value is string => typeof value === "string"
    );

    if (enumValues.length === property.enum.length) {
      return z.enum(enumValues as [string, ...string[]]);
    }
  }

  switch (property.type) {
    case "boolean":
      return z.boolean();
    case "number":
      return applyNumericConstraints(z.number(), property);
    case "integer":
      return applyNumericConstraints(z.number().int(), property);
    case "array": {
      const itemSchema = property.items
        ? jsonSchemaPropertyToZod(property.items)
        : z.unknown();
      return z.array(itemSchema);
    }
    case "object": {
      const childProperties = property.properties ?? {};
      const required = new Set(property.required ?? []);
      const shape: Record<string, z.ZodTypeAny> = {};

      for (const [key, child] of Object.entries(childProperties)) {
        const childSchema = jsonSchemaPropertyToZod(child);
        shape[key] = required.has(key) ? childSchema : childSchema.optional();
      }

      return z.object(shape);
    }
    case "string":
    default:
      return applyStringConstraints(z.string(), property);
  }
}

function extractDefaultsFromSchema(schema: JsonSchemaProperty): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  const properties = schema.properties ?? {};

  for (const [key, property] of Object.entries(properties)) {
    if (property.default !== undefined) {
      defaults[key] = property.default;
    }
  }

  return defaults;
}

function resolveTypeName(schema: z.ZodTypeAny): string {
  return (schema._def as { typeName?: string } | undefined)?.typeName ?? "";
}

function unwrapOptionalSchema(schema: z.ZodTypeAny): {
  schema: z.ZodTypeAny;
  required: boolean;
} {
  const typeName = resolveTypeName(schema);

  if (typeName === "ZodOptional") {
    const inner = (schema._def as { innerType: z.ZodTypeAny }).innerType;
    return {
      schema: inner,
      required: false
    };
  }

  return {
    schema,
    required: true
  };
}

function mapZodTypeToFieldType(schema: z.ZodTypeAny): SettingsSchemaFieldDescriptor["type"] {
  const typeName = resolveTypeName(schema);

  if (typeName === "ZodString" || typeName === "ZodEnum") {
    return "string";
  }

  if (typeName === "ZodNumber") {
    return "number";
  }

  if (typeName === "ZodBoolean") {
    return "boolean";
  }

  if (typeName === "ZodArray") {
    return "array";
  }

  if (typeName === "ZodObject") {
    return "object";
  }

  return "unknown";
}

function getObjectShape(schema: z.ZodTypeAny): Record<string, z.ZodTypeAny> {
  const rawShape = (schema._def as { shape: (() => Record<string, z.ZodTypeAny>) | Record<string, z.ZodTypeAny> }).shape;
  return typeof rawShape === "function" ? rawShape() : rawShape;
}

function toFieldDescriptor(
  key: string,
  schema: z.ZodTypeAny,
  defaults: Record<string, unknown>
): SettingsSchemaFieldDescriptor {
  const unwrapped = unwrapOptionalSchema(schema);
  const typeName = resolveTypeName(unwrapped.schema);
  const base: SettingsSchemaFieldDescriptor = {
    key,
    type: mapZodTypeToFieldType(unwrapped.schema),
    required: unwrapped.required
  };

  if (key in defaults) {
    base.defaultValue = defaults[key];
  }

  if (typeName === "ZodString") {
    const checks =
      ((unwrapped.schema._def as { checks?: Array<{ kind: string; value?: number }> }).checks ?? []);
    for (const check of checks) {
      if (check.kind === "min") {
        base.min = check.value;
      }

      if (check.kind === "max") {
        base.max = check.value;
      }
    }
  }

  if (typeName === "ZodNumber") {
    const numberDef = unwrapped.schema._def as {
      checks?: Array<{ kind: string; value?: number }>;
      typeName?: string;
    };
    const checks = numberDef.checks ?? [];
    if (checks.some((check) => check.kind === "int")) {
      base.type = "integer";
    }

    for (const check of checks) {
      if (check.kind === "min") {
        base.min = check.value;
      }

      if (check.kind === "max") {
        base.max = check.value;
      }
    }
  }

  if (typeName === "ZodEnum") {
    const enumDef = unwrapped.schema._def as { values?: string[] };
    base.enumValues = enumDef.values ?? [];
  }

  return base;
}

function registerStaticSettings() {
  if (settingsRegistry.getDefinition("overview")) {
    return;
  }

  settingsRegistry.register({
    moduleId: "overview",
    schema: z.object({
      refreshIntervalSeconds: z.number().int().min(15).max(3600),
      showRevenue: z.boolean(),
      showLiveOps: z.boolean()
    }),
    defaults: {
      refreshIntervalSeconds: 30,
      showRevenue: true,
      showLiveOps: true
    }
  });

  settingsRegistry.register({
    moduleId: "crm",
    schema: z.object({
      leadScoringEnabled: z.boolean(),
      autoAssignOwner: z.boolean(),
      staleLeadDays: z.number().int().min(1).max(365)
    }),
    defaults: {
      leadScoringEnabled: true,
      autoAssignOwner: false,
      staleLeadDays: 21
    }
  });

  settingsRegistry.register({
    moduleId: "billing",
    schemaVersion: 2,
    schema: z.object({
      currency: z.string().length(3),
      autoRetryFailedPayments: z.boolean(),
      retryWindowDays: z.number().int().min(1).max(30)
    }),
    migrations: [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (input) => {
          const record =
            input && typeof input === "object"
              ? (input as Record<string, unknown>)
              : {};

          return {
            ...record,
            retryWindowDays:
              typeof record.retryWindow === "number"
                ? record.retryWindow
                : record.retryWindowDays
          };
        }
      }
    ],
    defaults: {
      currency: "USD",
      autoRetryFailedPayments: true,
      retryWindowDays: 5
    }
  });

  settingsRegistry.register({
    moduleId: "scheduling",
    schema: z.object({
      defaultSlotMinutes: z.number().int().min(15).max(240),
      allowOverbooking: z.boolean()
    }),
    defaults: {
      defaultSlotMinutes: 60,
      allowOverbooking: false
    }
  });

  settingsRegistry.register({
    moduleId: "settings",
    schema: z.object({
      enforceMfa: z.boolean(),
      sessionTtlHours: z.number().int().min(1).max(168)
    }),
    defaults: {
      enforceMfa: true,
      sessionTtlHours: 12
    }
  });

  settingsRegistry.register({
    moduleId: "audit",
    schemaVersion: 2,
    schema: z.object({
      retentionDays: z.number().int().min(30).max(3650),
      redactSensitiveFields: z.boolean()
    }),
    migrations: [
      {
        fromVersion: 1,
        toVersion: 2,
        migrate: (input) => {
          const record =
            input && typeof input === "object"
              ? (input as Record<string, unknown>)
              : {};

          return {
            ...record,
            retentionDays:
              typeof record.retention === "number"
                ? record.retention
                : record.retentionDays,
            redactSensitiveFields:
              typeof record.redactSecrets === "boolean"
                ? record.redactSecrets
                : record.redactSensitiveFields
          };
        }
      }
    ],
    defaults: {
      retentionDays: 365,
      redactSensitiveFields: true
    }
  });

  settingsRegistry.register({
    moduleId: "intelligence",
    schema: z.object({
      warningFailureRatePct: z.number().min(0).max(100),
      criticalFailureRatePct: z.number().min(0).max(100),
      warningOverdueMinutes: z.number().int().min(1).max(24 * 60),
      criticalOverdueMinutes: z.number().int().min(1).max(24 * 60),
      warningSuccessRatePct: z.number().min(0).max(100),
      sloMaxFailureRatePct: z.number().min(0).max(100),
      sloMinSuccessRatePct: z.number().min(0).max(100),
      sloMaxOverdueSchedules: z.number().int().min(0).max(500),
      sloMaxStaleLagMinutes: z.number().int().min(0).max(24 * 60),
      sloMaxP95Attempts: z.number().min(0).max(10),
      sloMaxFailureRateDeltaPct: z.number().min(0).max(100)
    }),
    defaults: {
      warningFailureRatePct: 3,
      criticalFailureRatePct: 10,
      warningOverdueMinutes: 30,
      criticalOverdueMinutes: 120,
      warningSuccessRatePct: 97,
      sloMaxFailureRatePct: 2,
      sloMinSuccessRatePct: 98,
      sloMaxOverdueSchedules: 0,
      sloMaxStaleLagMinutes: 30,
      sloMaxP95Attempts: 2,
      sloMaxFailureRateDeltaPct: 5
    }
  });
}

async function registerGeneratedSettings() {
  let generatedModulesDir: string | null = null;

  for (const candidate of generatedModulesDirCandidates) {
    try {
      const stats = await fs.stat(candidate);
      if (stats.isDirectory()) {
        generatedModulesDir = candidate;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!generatedModulesDir) {
    return;
  }

  const entries = await fs.readdir(generatedModulesDir, { withFileTypes: true });

  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const moduleId = entry.name;
    if (settingsRegistry.getDefinition(moduleId)) {
      continue;
    }

    const schemaPath = path.join(generatedModulesDir, moduleId, "settings.schema.json");

    try {
      const raw = await fs.readFile(schemaPath, "utf-8");
      const parsed = JSON.parse(raw) as {
        schema?: JsonSchemaProperty;
        schemaVersion?: number;
      };
      const schemaRoot = parsed.schema;

      if (!schemaRoot || schemaRoot.type !== "object") {
        continue;
      }

      const shape: Record<string, z.ZodTypeAny> = {};
      const required = new Set(schemaRoot.required ?? []);

      for (const [key, property] of Object.entries(schemaRoot.properties ?? {})) {
        const propertySchema = jsonSchemaPropertyToZod(property);
        shape[key] = required.has(key) ? propertySchema : propertySchema.optional();
      }

      const defaults = extractDefaultsFromSchema(schemaRoot);

      settingsRegistry.register({
        moduleId,
        schemaVersion:
          typeof parsed.schemaVersion === "number" ? parsed.schemaVersion : undefined,
        schema: z.object(shape),
        defaults: Object.keys(defaults).length > 0 ? defaults : undefined
      });
    } catch {
      continue;
    }
  }
}

export async function ensureSettingsRegistryInitialized() {
  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    registerStaticSettings();
    await registerGeneratedSettings();
  })();

  return initializationPromise;
}

export async function listSettingsSchemaCatalog(): Promise<SettingsSchemaCatalogEntry[]> {
  await ensureSettingsRegistryInitialized();

  return settingsRegistry.listModuleIds().map((moduleId) => {
    const definition = settingsRegistry.getDefinition(moduleId);
    if (!definition) {
      return {
        moduleId,
        schemaVersion: 1,
        fields: []
      };
    }

    const defaults = (settingsRegistry.get<Record<string, unknown>>(moduleId) ?? {}) as Record<string, unknown>;
    const shape = getObjectShape(definition.schema);
    const fields = Object.entries(shape).map(([key, fieldSchema]) =>
      toFieldDescriptor(key, fieldSchema, defaults)
    );

    return {
      moduleId,
      schemaVersion: definition.schemaVersion,
      fields
    };
  });
}

export async function getSettingsSchemaCatalogEntry(moduleId: string) {
  const catalog = await listSettingsSchemaCatalog();
  return catalog.find((entry) => entry.moduleId === moduleId) ?? null;
}
