import type { z } from "zod";

export interface ModuleSettingsMigration {
  fromVersion: number;
  toVersion: number;
  migrate: (input: unknown) => unknown;
}

export interface ModuleSettingsDefinition<Schema extends z.ZodTypeAny = z.ZodTypeAny> {
  moduleId: string;
  schema: Schema;
  defaults?: z.input<Schema>;
  schemaVersion?: number;
  migrations?: ModuleSettingsMigration[];
}

interface RegisteredDefinition {
  moduleId: string;
  schema: z.ZodTypeAny;
  schemaVersion: number;
  migrations: ModuleSettingsMigration[];
}

export interface SettingsParseOptions {
  sourceSchemaVersion?: number;
}

export interface SettingsParseResult {
  values: unknown;
  sourceSchemaVersion: number;
  schemaVersion: number;
  migrated: boolean;
}

export class SettingsRegistry {
  private definitions = new Map<string, RegisteredDefinition>();

  private values = new Map<string, unknown>();

  private defaults = new Map<string, unknown>();

  register<Schema extends z.ZodTypeAny>(
    definition: ModuleSettingsDefinition<Schema>
  ): void {
    const schemaVersion = normalizeSchemaVersion(definition.schemaVersion);
    const migrations = normalizeMigrations(definition.migrations ?? []);

    this.definitions.set(definition.moduleId, {
      moduleId: definition.moduleId,
      schema: definition.schema,
      schemaVersion,
      migrations
    });

    if (definition.defaults !== undefined) {
      const parsedDefaults = definition.schema.parse(definition.defaults);
      this.values.set(definition.moduleId, parsedDefaults);
      this.defaults.set(definition.moduleId, parsedDefaults);
    }
  }

  set(moduleId: string, input: unknown, options: SettingsParseOptions = {}): unknown {
    const parsedResult = this.parse(moduleId, input, {
      sourceSchemaVersion: options.sourceSchemaVersion ?? this.getSchemaVersion(moduleId)
    });
    this.values.set(moduleId, parsedResult.values);
    return parsedResult.values;
  }

  parse(
    moduleId: string,
    input: unknown,
    options: SettingsParseOptions = {}
  ): SettingsParseResult {
    const definition = this.definitions.get(moduleId);
    if (!definition) {
      throw new Error(`Settings schema for module '${moduleId}' is not registered.`);
    }

    const sourceSchemaVersion = normalizeSourceSchemaVersion(options.sourceSchemaVersion);
    const migratedInput = this.applyMigrations(definition, input, sourceSchemaVersion);
    const parsed = definition.schema.parse(migratedInput);

    return {
      values: parsed,
      sourceSchemaVersion,
      schemaVersion: definition.schemaVersion,
      migrated: sourceSchemaVersion !== definition.schemaVersion
    };
  }

  get<T>(moduleId: string): T | undefined {
    return this.values.get(moduleId) as T | undefined;
  }

  getDefinition(moduleId: string): RegisteredDefinition | undefined {
    return this.definitions.get(moduleId);
  }

  getSchemaVersion(moduleId: string): number | undefined {
    return this.definitions.get(moduleId)?.schemaVersion;
  }

  safeSet(moduleId: string, input: unknown) {
    const definition = this.definitions.get(moduleId);
    if (!definition) {
      return {
        success: false as const,
        error: `Settings schema for module '${moduleId}' is not registered.`
      };
    }

    let parsedResult: SettingsParseResult;
    try {
      parsedResult = this.parse(moduleId, input, {
        sourceSchemaVersion: definition.schemaVersion
      });
    } catch (error) {
      return {
        success: false as const,
        error: error instanceof Error ? error.message : "Unknown settings parse error."
      };
    }

    this.values.set(moduleId, parsedResult.values);
    return {
      success: true as const,
      data: parsedResult.values
    };
  }

  reset(moduleId: string): unknown {
    if (!this.definitions.has(moduleId)) {
      throw new Error(`Settings schema for module '${moduleId}' is not registered.`);
    }

    if (this.defaults.has(moduleId)) {
      const defaults = this.defaults.get(moduleId);
      this.values.set(moduleId, defaults);
      return defaults;
    }

    this.values.delete(moduleId);
    return undefined;
  }

  listModuleIds(): string[] {
    return Array.from(this.definitions.keys());
  }

  list(): Array<{ moduleId: string; values: unknown }> {
    return Array.from(this.values.entries()).map(([moduleId, values]) => ({
      moduleId,
      values
    }));
  }

  private applyMigrations(
    definition: RegisteredDefinition,
    input: unknown,
    sourceSchemaVersion: number
  ): unknown {
    if (sourceSchemaVersion === definition.schemaVersion) {
      return input;
    }

    if (sourceSchemaVersion > definition.schemaVersion) {
      throw new Error(
        `Persisted settings for module '${definition.moduleId}' use schema version ${sourceSchemaVersion}, newer than current schema version ${definition.schemaVersion}.`
      );
    }

    let currentVersion = sourceSchemaVersion;
    let currentValue = input;

    while (currentVersion < definition.schemaVersion) {
      const nextMigration = definition.migrations.find(
        (migration) => migration.fromVersion === currentVersion
      );

      if (!nextMigration) {
        throw new Error(
          `Missing settings migration for module '${definition.moduleId}' from version ${currentVersion} to ${definition.schemaVersion}.`
        );
      }

      currentValue = nextMigration.migrate(currentValue);
      currentVersion = nextMigration.toVersion;
    }

    return currentValue;
  }
}

function normalizeSchemaVersion(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return 1;
  }

  return value;
}

function normalizeSourceSchemaVersion(value: number | undefined): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0) {
    return 0;
  }

  return value;
}

function normalizeMigrations(migrations: ModuleSettingsMigration[]): ModuleSettingsMigration[] {
  return [...migrations].sort((left, right) => left.fromVersion - right.fromVersion);
}
