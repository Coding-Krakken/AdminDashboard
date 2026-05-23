import {
  buildRuntimeDashboardModel,
  hasPermission,
  type ModuleCapabilityDescriptor,
  type ModuleDataSourceDescriptor,
  type ModuleManifest,
  type ModuleCategory,
  type Permission,
  type PluginCompatibilityReport,
  type ModulePlugin,
  type UserPolicyContext
} from "@universal-admin/core";
import {
  type AuthUser,
  createClerkAuthAdapter,
  createFileAuditAdapter,
  createFileDataAdapter,
  createPrismaKeyValueDataAdapter,
  createMemoryAuthAdapter,
  createNextAuthAdapter,
  createPollingRealtimeAdapter,
  type PrismaLikeClient
} from "@universal-admin/adapters";
import { resolveThemeTokens } from "@universal-admin/theming";
import {
  buildNavigation,
  buildShellModel,
  type NavigationItem,
  type ShellModel
} from "@universal-admin/ui";
import { createHmac, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { dashboardConfig, dashboardTheme, pluginSecurityPolicy } from "./config";
import { collectRuntimeHealth } from "./health";
import {
  applyPackFlags,
  filterModulesByPack,
  getModulePack,
  listModulePacks,
  resolveBusinessProfile
} from "./module-packs";
import { getRuntimePlugins, getStaticPlugins } from "./plugins";
import { ensureSettingsRegistryInitialized, settingsRegistry } from "./settings";

function resolveRuntimeStorePath(envKey: string, fallbackFile: string): string {
  const configured = process.env[envKey]?.trim();
  if (configured) {
    return path.resolve(process.cwd(), configured);
  }

  // Keep worker data isolated during parallel test execution while preserving
  // stable default filenames outside test workers.
  const workerSuffix = process.env.VITEST_WORKER_ID
    ? `.worker-${process.env.VITEST_WORKER_ID}`
    : "";

  return path.resolve(process.cwd(), `${fallbackFile}${workerSuffix}.json`);
}

const RUNTIME_DB_PATH = resolveRuntimeStorePath("ADMIN_RUNTIME_DB_PATH", ".runtime-data");
const RUNTIME_AUDIT_PATH = resolveRuntimeStorePath(
  "ADMIN_RUNTIME_AUDIT_PATH",
  ".runtime-audit"
);
const provider = process.env.ADMIN_AUTH_PROVIDER ?? "memory";
const dataProvider = process.env.ADMIN_DATA_PROVIDER ?? "file";

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getBearerToken(request?: Request): string | null {
  if (!request) {
    return null;
  }

  const value = request.headers.get("authorization");
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function readJsonHeader<T>(request: Request | undefined, headerName: string): T | null {
  if (!request) {
    return null;
  }

  const value = request.headers.get(headerName);
  if (!value) {
    return null;
  }

  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payloadRaw = decodeBase64Url(parts[1]);
    const payload = JSON.parse(payloadRaw) as Record<string, unknown>;
    return payload;
  } catch {
    return null;
  }
}

function verifyHs256Token(token: string, secret: string): boolean {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return false;
  }

  const data = `${parts[0]}.${parts[1]}`;
  const expected = createHmac("sha256", secret).update(data).digest("base64url");

  try {
    return timingSafeEqual(Buffer.from(parts[2]), Buffer.from(expected));
  } catch {
    return false;
  }
}

function claimsToPermissions(value: unknown): Permission[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Permission => typeof entry === "string");
  }

  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => item.trim())
      .filter((item): item is Permission => item.length > 0);
  }

  return [];
}

function buildUserFromClaims(claims: Record<string, unknown>): AuthUser {
  const id =
    typeof claims.sub === "string"
      ? claims.sub
      : typeof claims.userId === "string"
        ? claims.userId
        : "unknown-user";

  const email =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims.emailAddress === "string"
        ? claims.emailAddress
        : "unknown@example.com";

  return {
    id,
    email,
    role: (typeof claims.role === "string" ? claims.role : "viewer") as AuthUser["role"],
    tenantId: typeof claims.tenantId === "string" ? claims.tenantId : undefined,
    permissions: claimsToPermissions(claims.permissions)
  };
}

async function getRequestScopedUser(request?: Request): Promise<AuthUser | null> {
  if (!request) {
    return null;
  }

  if (provider === "jwt") {
    const token = getBearerToken(request);
    if (!token) {
      return null;
    }

    const requiredSecret = process.env.ADMIN_AUTH_JWT_SECRET;
    if (requiredSecret && !verifyHs256Token(token, requiredSecret)) {
      return null;
    }

    const claims = parseJwtClaims(token);
    if (!claims) {
      return null;
    }

    return buildUserFromClaims(claims);
  }

  if (provider === "nextauth") {
    const headerUser = readJsonHeader<Record<string, unknown>>(request, "x-nextauth-user");
    if (headerUser) {
      return buildUserFromClaims(headerUser);
    }

    const token = getBearerToken(request);
    if (token) {
      const claims = parseJwtClaims(token);
      if (claims) {
        return buildUserFromClaims(claims);
      }
    }

    return null;
  }

  if (provider === "clerk") {
    const userId = request.headers.get("x-clerk-user-id");
    if (!userId) {
      return null;
    }

    return {
      id: userId,
      email: request.headers.get("x-clerk-email") ?? "unknown@example.com",
      role: (request.headers.get("x-clerk-role") ?? "viewer") as AuthUser["role"],
      tenantId: request.headers.get("x-clerk-tenant-id") ?? undefined,
      permissions: claimsToPermissions(request.headers.get("x-clerk-permissions"))
    };
  }

  return null;
}

const resolveAuthAdapter = () => {
  if (provider === "nextauth") {
    return createNextAuthAdapter({
      getSession: async () => ({
        user: {
          id: "nextauth-user",
          email: "nextauth@example.com",
          role: process.env.ADMIN_AUTH_ROLE ?? "admin",
          tenantId: "default-tenant",
          permissions: ["dashboard:read", "settings:read"]
        }
      })
    });
  }

  if (provider === "clerk") {
    return createClerkAuthAdapter({
      getSession: async () => ({
        userId: "clerk-user",
        emailAddress: "clerk@example.com",
        publicMetadata: {
          role: process.env.ADMIN_AUTH_ROLE ?? "admin",
          tenantId: "default-tenant",
          permissions: ["dashboard:read", "settings:read"]
        }
      })
    });
  }

  return createMemoryAuthAdapter({
    id: "starter-owner",
    email: "owner@company.com",
    role: process.env.ADMIN_AUTH_ROLE ?? "owner",
    tenantId: "default-tenant",
    permissions: ["*:*"]
  });
};

const authAdapter = resolveAuthAdapter();

const auditAdapter = createFileAuditAdapter(RUNTIME_AUDIT_PATH);
const dataAdapter = resolveDataAdapter();
const realtimeAdapter = createPollingRealtimeAdapter({ intervalMs: 30000 });

function resolveDataAdapter() {
  if (dataProvider !== "prisma") {
    return createFileDataAdapter(RUNTIME_DB_PATH);
  }

  const globalClient = (globalThis as { __UNIVERSAL_ADMIN_PRISMA_CLIENT?: unknown })
    .__UNIVERSAL_ADMIN_PRISMA_CLIENT;

  if (!globalClient || typeof globalClient !== "object") {
    return createFileDataAdapter(RUNTIME_DB_PATH);
  }

  return createPrismaKeyValueDataAdapter(globalClient as PrismaLikeClient, {
    modelKey: process.env.ADMIN_PRISMA_STATE_MODEL ?? "runtimeState"
  });
}

interface DashboardModelOptions {
  profileOverride?: string;
  request?: Request;
}

interface TenantScopedOptions {
  request?: Request;
  tenantId?: string;
}

interface SettingsMutationOptions extends TenantScopedOptions {
  expectedVersion?: number;
}

interface DocumentMutationOptions extends TenantScopedOptions {
  expectedVersion?: number;
}

interface PersistedSettingsMeta {
  version: number;
  schemaVersion?: number;
  updatedAt: string;
  updatedBy: string | null;
}

interface PersistedSettingsEntry {
  values: unknown;
  __uaMeta: PersistedSettingsMeta;
}

export interface SettingsSnapshot {
  moduleId: string;
  values: unknown;
  version: number;
  schemaVersion: number;
  updatedAt: string | null;
  updatedBy: string | null;
}

export interface UserDashboardLayout {
  userId: string;
  profileId: string;
  widgets: string[];
  columns: number;
  updatedAt: string;
}

export interface IntelligenceAlertPolicy {
  id: string;
  name: string;
  enabled: boolean;
  severities: Array<"low" | "medium" | "high">;
  webhookUrl: string;
  retryLimit: number;
  version: number;
  alertIds?: string[];
  headers?: Record<string, string>;
  updatedAt: string;
}

export interface IntelligenceAlertDeliveryResult {
  policyId: string;
  alertId: string;
  severity: "low" | "medium" | "high";
  idempotencyKey: string;
  status: "delivered" | "failed" | "skipped";
  attempts: number;
  deliveredAt?: string;
  error?: string;
}

export interface IntelligenceAlertDeliveryRecord {
  policyId: string;
  windowToken: string;
  alertId: string;
  idempotencyKey: string;
  status: "delivered" | "failed" | "skipped";
  attempts: number;
  deliveredAt?: string;
  error?: string;
  at: string;
}

export interface IntelligenceDispatchSchedule {
  id: string;
  name: string;
  enabled: boolean;
  profileId: string;
  windowDays: number;
  cadenceMinutes: number;
  cooldownMinutes: number;
  version: number;
  policyIds?: string[];
  thresholds?: {
    warningFailureRatePct?: number;
    criticalFailureRatePct?: number;
    warningOverdueMinutes?: number;
    criticalOverdueMinutes?: number;
    warningSuccessRatePct?: number;
  };
  nextRunAt: string;
  lastRunAt?: string;
  updatedAt: string;
}

const SETTINGS_STORAGE_VERSION = 1;

function normalizeTenantId(rawTenantId: string | undefined): string {
  return rawTenantId && rawTenantId.trim().length > 0
    ? rawTenantId.trim()
    : "default-tenant";
}

async function resolveTenantId(options: TenantScopedOptions = {}): Promise<string> {
  if (typeof options.tenantId === "string" && options.tenantId.trim().length > 0) {
    return normalizeTenantId(options.tenantId);
  }

  try {
    const { user } = await getCurrentUserContext(options.request);
    return normalizeTenantId(user.tenantId);
  } catch {
    return "default-tenant";
  }
}

function buildTenantScopedKey(baseKey: string, tenantId: string): string {
  return `${baseKey}:${normalizeTenantId(tenantId)}`;
}

function isPersistedSettingsEntry(value: unknown): value is PersistedSettingsEntry {
  if (!value || typeof value !== "object") {
    return false;
  }

  const record = value as Record<string, unknown>;
  if (!("values" in record) || !("__uaMeta" in record)) {
    return false;
  }

  const meta = record.__uaMeta;
  if (!meta || typeof meta !== "object") {
    return false;
  }

  const metaRecord = meta as Record<string, unknown>;
  return (
    typeof metaRecord.version === "number" &&
    typeof metaRecord.updatedAt === "string" &&
    (typeof metaRecord.updatedBy === "string" || metaRecord.updatedBy === null)
  );
}

function getPersistedSnapshot(
  moduleId: string,
  value: unknown,
  fallbackValues: unknown
): SettingsSnapshot {
  const schemaVersion = settingsRegistry.getSchemaVersion(moduleId) ?? 1;

  let sourceSchemaVersion = 0;
  let version = 0;
  let updatedAt: string | null = null;
  let updatedBy: string | null = null;
  let rawValues: unknown = fallbackValues;

  if (isPersistedSettingsEntry(value)) {
    rawValues = value.values;
    version = value.__uaMeta.version;
    sourceSchemaVersion =
      typeof value.__uaMeta.schemaVersion === "number" ? value.__uaMeta.schemaVersion : 0;
    updatedAt = value.__uaMeta.updatedAt;
    updatedBy = value.__uaMeta.updatedBy;
  } else if (value !== undefined) {
    rawValues = value;
    sourceSchemaVersion = 0;
  } else {
    sourceSchemaVersion = schemaVersion;
  }

  let parsed;
  try {
    parsed = settingsRegistry.parse(moduleId, rawValues, {
      sourceSchemaVersion
    });
  } catch {
    parsed = settingsRegistry.parse(moduleId, rawValues, {
      sourceSchemaVersion: schemaVersion
    });
  }

  return {
    moduleId,
    values: parsed.values,
    version,
    schemaVersion: parsed.schemaVersion,
    updatedAt,
    updatedBy
  };
}

function getCurrentVersion(value: unknown): number {
  if (isPersistedSettingsEntry(value)) {
    return value.__uaMeta.version;
  }

  if (value !== undefined) {
    return 0;
  }

  return 0;
}

function getDocumentVersion(value: unknown): number {
  if (!value || typeof value !== "object") {
    return 0;
  }

  const record = value as Record<string, unknown>;
  return typeof record.version === "number" && Number.isFinite(record.version)
    ? Math.max(0, Math.trunc(record.version))
    : 0;
}

function normalizeLayoutInput(input: unknown): Pick<UserDashboardLayout, "profileId" | "widgets" | "columns"> {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const profileId =
    typeof record.profileId === "string" && record.profileId.length > 0
      ? record.profileId
      : "generic";

  const widgets = Array.isArray(record.widgets)
    ? record.widgets.filter((entry): entry is string => typeof entry === "string")
    : [];

  const columnsRaw = typeof record.columns === "number" ? record.columns : 3;
  const columns = Math.max(1, Math.min(Math.trunc(columnsRaw), 6));

  return {
    profileId,
    widgets,
    columns
  };
}

function normalizeIntelligencePolicyInput(input: unknown): IntelligenceAlertPolicy {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};

  const id =
    typeof record.id === "string" && record.id.trim().length > 0
      ? record.id.trim()
      : `policy-${Date.now()}`;

  const severities: Array<"low" | "medium" | "high"> = Array.isArray(record.severities)
    ? record.severities.filter(
        (value): value is "low" | "medium" | "high" =>
          value === "low" || value === "medium" || value === "high"
      )
    : ["high"];

  const headers: Record<string, string> | undefined =
    record.headers && typeof record.headers === "object"
      ? Object.entries(record.headers as Record<string, unknown>).reduce<Record<string, string>>(
          (acc, [header, value]) => {
            if (typeof header === "string" && header.length > 0 && typeof value === "string") {
              acc[header] = value;
            }
            return acc;
          },
          {}
        )
      : undefined;

  return {
    id,
    name:
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name.trim()
        : id,
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    severities: severities.length > 0 ? severities : ["high"],
    webhookUrl:
      typeof record.webhookUrl === "string" && record.webhookUrl.trim().length > 0
        ? record.webhookUrl.trim()
        : "",
    retryLimit:
      typeof record.retryLimit === "number"
        ? Math.max(1, Math.min(Math.trunc(record.retryLimit), 5))
        : 3,
    version:
      typeof record.version === "number"
        ? Math.max(0, Math.trunc(record.version))
        : 0,
    alertIds: Array.isArray(record.alertIds)
      ? record.alertIds.filter((value): value is string => typeof value === "string")
      : undefined,
    headers,
    updatedAt: new Date().toISOString()
  };
}

function normalizeStoredPolicy(input: unknown): IntelligenceAlertPolicy | null {
  const candidate = normalizeIntelligencePolicyInput(input);
  if (!candidate.webhookUrl) {
    return null;
  }

  return candidate;
}

async function getIntelligencePolicyStore(options: TenantScopedOptions = {}) {
  const tenantId = await resolveTenantId(options);
  const key = buildTenantScopedKey("runtime:intelligencePolicies", tenantId);
  const value = (await dataAdapter.query<Record<string, unknown>>(key)) ?? {};
  return { key, value };
}

async function getIntelligenceDeliveryStore(options: TenantScopedOptions = {}) {
  const tenantId = await resolveTenantId(options);
  const key = buildTenantScopedKey("runtime:intelligenceDeliveries", tenantId);
  const value = (await dataAdapter.query<Record<string, unknown>>(key)) ?? {};
  return { key, value };
}

async function getIntelligenceScheduleStore(options: TenantScopedOptions = {}) {
  const tenantId = await resolveTenantId(options);
  const key = buildTenantScopedKey("runtime:intelligenceSchedules", tenantId);
  const value = (await dataAdapter.query<Record<string, unknown>>(key)) ?? {};
  return { key, value };
}

function normalizeIntelligenceScheduleInput(input: unknown): IntelligenceDispatchSchedule {
  const record =
    input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const nowIso = new Date().toISOString();

  const thresholdsRecord =
    record.thresholds && typeof record.thresholds === "object"
      ? (record.thresholds as Record<string, unknown>)
      : null;

  const normalizeThreshold = (
    value: unknown,
    bounds: { min: number; max: number }
  ): number | undefined => {
    if (typeof value !== "number" || !Number.isFinite(value)) {
      return undefined;
    }

    return Math.max(bounds.min, Math.min(value, bounds.max));
  };

  const normalizedThresholds = thresholdsRecord
    ? {
        warningFailureRatePct: normalizeThreshold(thresholdsRecord.warningFailureRatePct, {
          min: 0,
          max: 100
        }),
        criticalFailureRatePct: normalizeThreshold(thresholdsRecord.criticalFailureRatePct, {
          min: 0,
          max: 100
        }),
        warningOverdueMinutes: normalizeThreshold(thresholdsRecord.warningOverdueMinutes, {
          min: 0,
          max: 24 * 60
        }),
        criticalOverdueMinutes: normalizeThreshold(thresholdsRecord.criticalOverdueMinutes, {
          min: 0,
          max: 24 * 60
        }),
        warningSuccessRatePct: normalizeThreshold(thresholdsRecord.warningSuccessRatePct, {
          min: 0,
          max: 100
        })
      }
    : undefined;

  const hasThresholdOverrides =
    normalizedThresholds &&
    Object.values(normalizedThresholds).some((value) => typeof value === "number");

  const cadenceMinutes =
    typeof record.cadenceMinutes === "number"
      ? Math.max(5, Math.min(Math.trunc(record.cadenceMinutes), 24 * 60))
      : 60;

  const cooldownMinutes =
    typeof record.cooldownMinutes === "number"
      ? Math.max(0, Math.min(Math.trunc(record.cooldownMinutes), 24 * 60))
      : 15;

  const windowDays =
    typeof record.windowDays === "number"
      ? Math.max(3, Math.min(Math.trunc(record.windowDays), 30))
      : 7;

  const parsedNextRunAt =
    typeof record.nextRunAt === "string" ? Date.parse(record.nextRunAt) : Number.NaN;
  const nextRunAt = Number.isNaN(parsedNextRunAt)
    ? new Date(Date.now() + cadenceMinutes * 60 * 1000).toISOString()
    : new Date(parsedNextRunAt).toISOString();

  return {
    id:
      typeof record.id === "string" && record.id.trim().length > 0
        ? record.id.trim()
        : `schedule-${Date.now()}`,
    name:
      typeof record.name === "string" && record.name.trim().length > 0
        ? record.name.trim()
        : "Intelligence schedule",
    enabled: typeof record.enabled === "boolean" ? record.enabled : true,
    profileId:
      typeof record.profileId === "string" && record.profileId.trim().length > 0
        ? record.profileId.trim()
        : "generic",
    windowDays,
    cadenceMinutes,
    cooldownMinutes,
    version:
      typeof record.version === "number"
        ? Math.max(0, Math.trunc(record.version))
        : 0,
    policyIds: Array.isArray(record.policyIds)
      ? record.policyIds.filter((value): value is string => typeof value === "string")
      : undefined,
    thresholds: hasThresholdOverrides ? normalizedThresholds : undefined,
    nextRunAt,
    lastRunAt:
      typeof record.lastRunAt === "string" && !Number.isNaN(Date.parse(record.lastRunAt))
        ? new Date(Date.parse(record.lastRunAt)).toISOString()
        : undefined,
    updatedAt: nowIso
  };
}

function normalizeStoredSchedule(input: unknown): IntelligenceDispatchSchedule | null {
  const schedule = normalizeIntelligenceScheduleInput(input);
  if (!schedule.id) {
    return null;
  }

  return schedule;
}

async function resolveActorId(options: TenantScopedOptions = {}): Promise<string | null> {
  try {
    const { user } = await getCurrentUserContext(options.request);
    return user.id;
  } catch {
    return null;
  }
}

export function createRequestFromHeaderEntries(
  entries: Iterable<[string, string]>
): Request {
  const headers = new Headers();
  for (const [key, value] of entries) {
    headers.set(key, value);
  }

  return new Request("http://localhost/admin", {
    headers
  });
}

const categoryDefaultCapabilities: Record<ModuleCategory, ModuleCapabilityDescriptor[]> = {
  overview: [
    { id: "monitoring.kpi", label: "KPI Monitoring", maturity: "core" },
    { id: "analytics.summary", label: "Executive Summaries", maturity: "core" }
  ],
  operations: [
    { id: "workflow.execution", label: "Workflow Execution", maturity: "core" },
    { id: "operations.planning", label: "Operational Planning", maturity: "extended" }
  ],
  customers: [
    { id: "customer.lifecycle", label: "Customer Lifecycle", maturity: "core" },
    { id: "engagement.tracking", label: "Engagement Tracking", maturity: "extended" }
  ],
  finance: [
    { id: "finance.reconciliation", label: "Financial Reconciliation", maturity: "core" },
    { id: "revenue.insights", label: "Revenue Insights", maturity: "extended" }
  ],
  automation: [
    { id: "automation.orchestration", label: "Automation Orchestration", maturity: "core" },
    { id: "automation.rules", label: "Rule Automation", maturity: "extended" }
  ],
  security: [
    { id: "security.detect", label: "Threat Detection", maturity: "core" },
    { id: "security.response", label: "Incident Response", maturity: "extended" }
  ],
  system: [
    { id: "platform.configuration", label: "Platform Configuration", maturity: "core" },
    { id: "platform.observability", label: "Platform Observability", maturity: "extended" }
  ],
  custom: [{ id: "custom.extension", label: "Custom Extension", maturity: "core" }]
};

const categoryDefaultDataSources: Record<ModuleCategory, ModuleDataSourceDescriptor[]> = {
  overview: [{ id: "runtime-kpis", type: "internal", entity: "runtime-kpi", realtime: true }],
  operations: [{ id: "ops-events", type: "internal", entity: "operation-event", realtime: true }],
  customers: [{ id: "customer-records", type: "internal", entity: "customer-profile" }],
  finance: [{ id: "finance-ledger", type: "warehouse", entity: "ledger-entry" }],
  automation: [{ id: "automation-jobs", type: "internal", entity: "automation-job", realtime: true }],
  security: [{ id: "security-events", type: "stream", entity: "security-event", realtime: true }],
  system: [{ id: "system-runtime", type: "internal", entity: "runtime-state", realtime: true }],
  custom: [{ id: "custom-source", type: "external", entity: "custom-record" }]
};

function mergeCapabilities(
  moduleId: string,
  category: ModuleCategory,
  manifestCapabilities: ModuleCapabilityDescriptor[] | undefined
) {
  const defaults = categoryDefaultCapabilities[category] ?? [];
  const merged = [...defaults, ...(manifestCapabilities ?? [])];
  const unique = new Map<string, ModuleCapabilityDescriptor>();

  for (const descriptor of merged) {
    const normalizedId = descriptor.id.includes(".")
      ? descriptor.id
      : `${moduleId}.${descriptor.id}`;

    unique.set(normalizedId, {
      ...descriptor,
      id: normalizedId
    });
  }

  return Array.from(unique.values());
}

function mergeDataSources(
  category: ModuleCategory,
  manifestDataSources: ModuleDataSourceDescriptor[] | undefined
) {
  const defaults = categoryDefaultDataSources[category] ?? [];
  const merged = [...defaults, ...(manifestDataSources ?? [])];
  const unique = new Map<string, ModuleDataSourceDescriptor>();

  for (const descriptor of merged) {
    unique.set(descriptor.id, descriptor);
  }

  return Array.from(unique.values());
}

export function buildModuleCapabilityCatalog(modules: ModuleManifest[]) {
  return modules.map((module) => {
    const category = module.category ?? "custom";
    return {
      moduleId: module.id,
      title: module.title,
      category,
      tags: module.tags ?? [],
      capabilities: mergeCapabilities(module.id, category, module.capabilities),
      dataSources: mergeDataSources(category, module.dataSources)
    };
  });
}

export interface PluginRolloutSummary {
  total: number;
  enabled: number;
  disabled: number;
  canary: {
    total: number;
    enabled: number;
    blocked: number;
  };
}

export function buildPluginRolloutSummary(
  compatibility: PluginCompatibilityReport[]
): PluginRolloutSummary {
  const summary: PluginRolloutSummary = {
    total: compatibility.length,
    enabled: 0,
    disabled: 0,
    canary: {
      total: 0,
      enabled: 0,
      blocked: 0
    }
  };

  for (const plugin of compatibility) {
    const isEnabled = plugin.rolloutEnabled ?? true;
    if (isEnabled) {
      summary.enabled += 1;
    } else {
      summary.disabled += 1;
    }

    if (plugin.rolloutStage === "canary") {
      summary.canary.total += 1;
      if (isEnabled) {
        summary.canary.enabled += 1;
      } else {
        summary.canary.blocked += 1;
      }
    }
  }

  return summary;
}

export async function listModuleSettings(options: TenantScopedOptions = {}) {
  await ensureSettingsRegistryInitialized();
  const tenantId = await resolveTenantId(options);

  const snapshots = settingsRegistry.list();
  const persisted = await dataAdapter.query<Record<string, unknown>>(
    buildTenantScopedKey("runtime:moduleSettings", tenantId)
  );

  return snapshots.map((snapshot) => {
    const persistedValue =
      persisted && typeof persisted === "object"
        ? (persisted[snapshot.moduleId] as unknown)
        : undefined;

    return getPersistedSnapshot(snapshot.moduleId, persistedValue, snapshot.values);
  });
}

export async function getModuleSettings(
  moduleId: string,
  options: TenantScopedOptions = {}
) {
  const allSettings = await listModuleSettings(options);
  return allSettings.find((snapshot) => snapshot.moduleId === moduleId) ?? null;
}

export async function updateModuleSettings(
  moduleId: string,
  values: unknown,
  options: SettingsMutationOptions = {}
) {
  await ensureSettingsRegistryInitialized();
  const tenantId = await resolveTenantId(options);
  const actorId = await resolveActorId(options);

  const parsed = settingsRegistry.set(moduleId, values);
  const schemaVersion = settingsRegistry.getSchemaVersion(moduleId) ?? 1;

  const current =
    (await dataAdapter.query<Record<string, unknown>>(
      buildTenantScopedKey("runtime:moduleSettings", tenantId)
    )) ?? {};

  const currentVersion = getCurrentVersion(current[moduleId]);

  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`settings-version-conflict:${currentVersion}`);
  }

  const nextVersion = currentVersion + SETTINGS_STORAGE_VERSION;

  const updatedAt = new Date().toISOString();

  await dataAdapter.mutate(buildTenantScopedKey("runtime:moduleSettings", tenantId), {
    ...current,
    [moduleId]: {
      values: parsed,
      __uaMeta: {
        version: nextVersion,
        schemaVersion,
        updatedAt,
        updatedBy: actorId
      }
    } satisfies PersistedSettingsEntry
  });

  return {
    moduleId,
    values: parsed,
    version: nextVersion,
    schemaVersion,
    updatedAt,
    updatedBy: actorId
  } satisfies SettingsSnapshot;
}

export async function patchModuleSettings(
  moduleId: string,
  values: unknown,
  options: SettingsMutationOptions = {}
) {
  const existing = (await getModuleSettings(moduleId, options))?.values;
  const nextValues = {
    ...(existing && typeof existing === "object" ? existing : {}),
    ...(values && typeof values === "object" ? (values as Record<string, unknown>) : {})
  };

  return updateModuleSettings(moduleId, nextValues, options);
}

export async function resetModuleSettings(
  moduleId: string,
  options: SettingsMutationOptions = {}
) {
  await ensureSettingsRegistryInitialized();
  const tenantId = await resolveTenantId(options);
  const actorId = await resolveActorId(options);

  const resetValues = settingsRegistry.reset(moduleId);
  const schemaVersion = settingsRegistry.getSchemaVersion(moduleId) ?? 1;
  const current =
    (await dataAdapter.query<Record<string, unknown>>(
      buildTenantScopedKey("runtime:moduleSettings", tenantId)
    )) ?? {};

  const currentVersion = getCurrentVersion(current[moduleId]);

  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`settings-version-conflict:${currentVersion}`);
  }

  const nextVersion = currentVersion + SETTINGS_STORAGE_VERSION;

  const updatedAt = new Date().toISOString();

  const next = { ...current };
  if (resetValues === undefined) {
    delete next[moduleId];
  } else {
    next[moduleId] = {
      values: resetValues,
      __uaMeta: {
        version: nextVersion,
        schemaVersion,
        updatedAt,
        updatedBy: actorId
      }
    } satisfies PersistedSettingsEntry;
  }

  await dataAdapter.mutate(buildTenantScopedKey("runtime:moduleSettings", tenantId), next);
  return {
    moduleId,
    values: resetValues,
    version: nextVersion,
    schemaVersion,
    updatedAt,
    updatedBy: actorId
  } satisfies SettingsSnapshot;
}

export async function getUserDashboardLayout(options: TenantScopedOptions = {}) {
  const { user } = await getCurrentUserContext(options.request);
  const tenantId = await resolveTenantId(options);
  const key = buildTenantScopedKey("runtime:dashboardLayouts", tenantId);
  const layouts = (await dataAdapter.query<Record<string, unknown>>(key)) ?? {};
  const existing = layouts[user.id];

  if (!existing || typeof existing !== "object") {
    return {
      userId: user.id,
      profileId: "generic",
      widgets: [],
      columns: 3,
      updatedAt: new Date().toISOString()
    } satisfies UserDashboardLayout;
  }

  const normalized = normalizeLayoutInput(existing);
  return {
    userId: user.id,
    ...normalized,
    updatedAt:
      typeof (existing as Record<string, unknown>).updatedAt === "string"
        ? ((existing as Record<string, unknown>).updatedAt as string)
        : new Date().toISOString()
  } satisfies UserDashboardLayout;
}

export async function updateUserDashboardLayout(
  input: unknown,
  options: TenantScopedOptions = {}
) {
  const { user } = await getCurrentUserContext(options.request);
  const tenantId = await resolveTenantId(options);
  const key = buildTenantScopedKey("runtime:dashboardLayouts", tenantId);
  const layouts = (await dataAdapter.query<Record<string, unknown>>(key)) ?? {};
  const normalized = normalizeLayoutInput(input);

  const nextLayout = {
    userId: user.id,
    ...normalized,
    updatedAt: new Date().toISOString()
  } satisfies UserDashboardLayout;

  await dataAdapter.mutate(key, {
    ...layouts,
    [user.id]: nextLayout
  });

  return nextLayout;
}

export async function listIntelligenceAlertPolicies(options: TenantScopedOptions = {}) {
  const store = await getIntelligencePolicyStore(options);
  return Object.values(store.value)
    .map((item) => normalizeStoredPolicy(item))
    .filter((item): item is IntelligenceAlertPolicy => Boolean(item));
}

export async function upsertIntelligenceAlertPolicy(
  input: unknown,
  options: DocumentMutationOptions = {}
) {
  const nextPolicy = normalizeIntelligencePolicyInput(input);
  if (!nextPolicy.webhookUrl) {
    throw new Error("Missing webhookUrl for intelligence alert policy.");
  }

  const store = await getIntelligencePolicyStore(options);
  const existing =
    store.value[nextPolicy.id] && typeof store.value[nextPolicy.id] === "object"
      ? (store.value[nextPolicy.id] as Record<string, unknown>)
      : {};
  const currentVersion = getDocumentVersion(existing);

  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`policy-version-conflict:${currentVersion}`);
  }

  const merged = {
    ...existing,
    ...nextPolicy,
    version: currentVersion + SETTINGS_STORAGE_VERSION,
    updatedAt: new Date().toISOString()
  } satisfies IntelligenceAlertPolicy;

  await dataAdapter.mutate(store.key, {
    ...store.value,
    [nextPolicy.id]: merged
  });

  return merged;
}

export async function deleteIntelligenceAlertPolicy(
  policyId: string,
  options: DocumentMutationOptions = {}
) {
  const store = await getIntelligencePolicyStore(options);
  const existing =
    store.value[policyId] && typeof store.value[policyId] === "object"
      ? (store.value[policyId] as Record<string, unknown>)
      : undefined;

  const currentVersion = getDocumentVersion(existing);
  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`policy-version-conflict:${currentVersion}`);
  }

  const next = { ...store.value };
  delete next[policyId];
  await dataAdapter.mutate(store.key, next);
}

export async function listIntelligenceDispatchSchedules(options: TenantScopedOptions = {}) {
  const store = await getIntelligenceScheduleStore(options);
  return Object.values(store.value)
    .map((value) => normalizeStoredSchedule(value))
    .filter((value): value is IntelligenceDispatchSchedule => Boolean(value))
    .sort((a, b) => Date.parse(a.nextRunAt) - Date.parse(b.nextRunAt));
}

export async function upsertIntelligenceDispatchSchedule(
  input: unknown,
  options: DocumentMutationOptions = {}
) {
  const nextSchedule = normalizeIntelligenceScheduleInput(input);
  const store = await getIntelligenceScheduleStore(options);
  const existing =
    store.value[nextSchedule.id] && typeof store.value[nextSchedule.id] === "object"
      ? (store.value[nextSchedule.id] as Record<string, unknown>)
      : {};
  const currentVersion = getDocumentVersion(existing);

  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`schedule-version-conflict:${currentVersion}`);
  }

  const merged = {
    ...existing,
    ...nextSchedule,
    version: currentVersion + SETTINGS_STORAGE_VERSION,
    updatedAt: new Date().toISOString()
  } satisfies IntelligenceDispatchSchedule;

  await dataAdapter.mutate(store.key, {
    ...store.value,
    [nextSchedule.id]: merged
  });

  return merged;
}

export async function deleteIntelligenceDispatchSchedule(
  scheduleId: string,
  options: DocumentMutationOptions = {}
) {
  const store = await getIntelligenceScheduleStore(options);
  const existing =
    store.value[scheduleId] && typeof store.value[scheduleId] === "object"
      ? (store.value[scheduleId] as Record<string, unknown>)
      : undefined;
  const currentVersion = getDocumentVersion(existing);

  if (
    typeof options.expectedVersion === "number" &&
    options.expectedVersion !== currentVersion
  ) {
    throw new Error(`schedule-version-conflict:${currentVersion}`);
  }

  const next = { ...store.value };
  delete next[scheduleId];
  await dataAdapter.mutate(store.key, next);
}

export async function listDueIntelligenceDispatchSchedules(
  options: TenantScopedOptions & {
    now?: string;
    limit?: number;
  } = {}
) {
  const schedules = await listIntelligenceDispatchSchedules(options);
  const nowMs = Date.parse(options.now ?? new Date().toISOString());
  const limit = typeof options.limit === "number" ? Math.max(1, options.limit) : 20;

  return schedules
    .filter((schedule) => {
      if (!schedule.enabled) {
        return false;
      }

      const nextRunMs = Date.parse(schedule.nextRunAt);
      if (Number.isNaN(nextRunMs) || nextRunMs > nowMs) {
        return false;
      }

      if (schedule.cooldownMinutes > 0 && schedule.lastRunAt) {
        const lastRunMs = Date.parse(schedule.lastRunAt);
        if (!Number.isNaN(lastRunMs)) {
          const cooldownCutoff = lastRunMs + schedule.cooldownMinutes * 60 * 1000;
          if (cooldownCutoff > nowMs) {
            return false;
          }
        }
      }

      return true;
    })
    .slice(0, limit);
}

export async function markIntelligenceDispatchScheduleRun(
  scheduleId: string,
  options: TenantScopedOptions & {
    runAt?: string;
  } = {}
) {
  const runAt = options.runAt ?? new Date().toISOString();
  const store = await getIntelligenceScheduleStore(options);
  const rawSchedule = store.value[scheduleId];

  if (!rawSchedule) {
    return null;
  }

  const schedule = normalizeStoredSchedule(rawSchedule);
  if (!schedule) {
    return null;
  }

  const runAtMs = Date.parse(runAt);
  const nextRunAt = Number.isNaN(runAtMs)
    ? schedule.nextRunAt
    : new Date(runAtMs + schedule.cadenceMinutes * 60 * 1000).toISOString();

  const updated = {
    ...schedule,
    version: schedule.version + SETTINGS_STORAGE_VERSION,
    lastRunAt: Number.isNaN(runAtMs) ? schedule.lastRunAt : new Date(runAtMs).toISOString(),
    nextRunAt,
    updatedAt: new Date().toISOString()
  } satisfies IntelligenceDispatchSchedule;

  await dataAdapter.mutate(store.key, {
    ...store.value,
    [scheduleId]: updated
  });

  return updated;
}

export async function dispatchIntelligenceAlerts(
  alerts: Array<{
    id: string;
    severity: "low" | "medium" | "high";
    title: string;
    detail: string;
  }>,
  options: TenantScopedOptions & {
    windowToken: string;
    profileId: string;
    generatedAt?: string;
    policyIds?: string[];
  }
) {
  const allPolicies = await listIntelligenceAlertPolicies(options);
  const policyScope = Array.isArray(options.policyIds)
    ? new Set(options.policyIds.filter((value) => typeof value === "string"))
    : null;
  const policies =
    policyScope && policyScope.size > 0
      ? allPolicies.filter((policy) => policyScope.has(policy.id))
      : allPolicies;
  const deliveryStore = await getIntelligenceDeliveryStore(options);
  const nextDeliveryStore = { ...deliveryStore.value };
  const nowIso = options.generatedAt ?? new Date().toISOString();
  const results: IntelligenceAlertDeliveryResult[] = [];

  for (const policy of policies) {
    if (!policy.enabled) {
      continue;
    }

    for (const alert of alerts) {
      if (!policy.severities.includes(alert.severity)) {
        continue;
      }

      if (policy.alertIds && policy.alertIds.length > 0 && !policy.alertIds.includes(alert.id)) {
        continue;
      }

      const idempotencyKey = `${policy.id}:${options.windowToken}:${alert.id}`;
      const previousDelivery =
        nextDeliveryStore[idempotencyKey] &&
        typeof nextDeliveryStore[idempotencyKey] === "object"
          ? (nextDeliveryStore[idempotencyKey] as Record<string, unknown>)
          : null;

      if (previousDelivery?.status === "delivered") {
        results.push({
          policyId: policy.id,
          alertId: alert.id,
          severity: alert.severity,
          idempotencyKey,
          status: "skipped",
          attempts: Number(previousDelivery.attempts ?? 0),
          deliveredAt:
            typeof previousDelivery.deliveredAt === "string"
              ? previousDelivery.deliveredAt
              : undefined
        });
        continue;
      }

      let attempts = 0;
      let delivered = false;
      let lastError: string | undefined;

      while (attempts < policy.retryLimit && !delivered) {
        attempts += 1;

        try {
          const response = await fetch(policy.webhookUrl, {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "x-alert-policy-id": policy.id,
              "x-alert-idempotency-key": idempotencyKey,
              ...(policy.headers ?? {})
            },
            body: JSON.stringify({
              profileId: options.profileId,
              windowToken: options.windowToken,
              generatedAt: nowIso,
              alert
            })
          });

          if (response.ok) {
            delivered = true;
          } else {
            lastError = `Webhook HTTP ${response.status}`;
          }
        } catch (error) {
          lastError = error instanceof Error ? error.message : "Webhook delivery failure.";
        }
      }

      const result: IntelligenceAlertDeliveryResult = {
        policyId: policy.id,
        alertId: alert.id,
        severity: alert.severity,
        idempotencyKey,
        status: delivered ? "delivered" : "failed",
        attempts,
        deliveredAt: delivered ? new Date().toISOString() : undefined,
        error: delivered ? undefined : lastError
      };

      nextDeliveryStore[idempotencyKey] = {
        status: result.status,
        attempts: result.attempts,
        deliveredAt: result.deliveredAt ?? null,
        error: result.error ?? null,
        at: nowIso
      };
      results.push(result);
    }
  }

  await dataAdapter.mutate(deliveryStore.key, nextDeliveryStore);
  return results;
}

export async function listIntelligenceAlertDeliveries(
  options: TenantScopedOptions & {
    limit?: number;
    policyId?: string;
    windowToken?: string;
    status?: "delivered" | "failed" | "skipped";
  } = {}
) {
  const deliveryStore = await getIntelligenceDeliveryStore(options);
  const limit = typeof options.limit === "number" ? Math.max(1, options.limit) : 50;
  const records: IntelligenceAlertDeliveryRecord[] = [];

  for (const [idempotencyKey, rawValue] of Object.entries(deliveryStore.value)) {
    if (!rawValue || typeof rawValue !== "object") {
      continue;
    }

    const [policyId = "", windowToken = "", alertId = ""] = idempotencyKey.split(":");
    if (!policyId || !windowToken || !alertId) {
      continue;
    }

    const value = rawValue as Record<string, unknown>;
    const status =
      value.status === "delivered" || value.status === "failed" || value.status === "skipped"
        ? value.status
        : "failed";

    if (options.policyId && options.policyId !== policyId) {
      continue;
    }

    if (options.windowToken && options.windowToken !== windowToken) {
      continue;
    }

    if (options.status && options.status !== status) {
      continue;
    }

    records.push({
      policyId,
      windowToken,
      alertId,
      idempotencyKey,
      status,
      attempts: typeof value.attempts === "number" ? Math.max(0, value.attempts) : 0,
      deliveredAt: typeof value.deliveredAt === "string" ? value.deliveredAt : undefined,
      error: typeof value.error === "string" ? value.error : undefined,
      at: typeof value.at === "string" ? value.at : new Date(0).toISOString()
    });
  }

  records.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return records.slice(0, limit);
}

interface ListAuditEventsOptions {
  limit?: number;
  action?: string;
  entity?: string;
  entityId?: string;
  actorId?: string;
  deniedOnly?: boolean;
  since?: string;
  until?: string;
  request?: Request;
  tenantId?: string;
}

function extractEventTimestamp(event: { metadata?: Record<string, unknown> }): number {
  const eventTimestampRaw =
    typeof event.metadata?.at === "string"
      ? event.metadata.at
      : typeof event.metadata?.timestamp === "string"
        ? event.metadata.timestamp
        : undefined;

  if (!eventTimestampRaw) {
    return Number.NaN;
  }

  return Date.parse(eventTimestampRaw);
}

function normalizeAuditMetadata(metadata: Record<string, unknown> | undefined) {
  const base = metadata ?? {};
  const atRaw =
    typeof base.at === "string"
      ? base.at
      : typeof base.timestamp === "string"
        ? base.timestamp
        : undefined;

  return atRaw ? { ...base, at: atRaw } : base;
}

function isSensitiveAuditKey(key: string): boolean {
  return /(pass(word)?|secret|token|api[-_]?key|authorization|cookie)/i.test(key);
}

function redactAuditValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => redactAuditValue(item));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const record = value as Record<string, unknown>;
  const next: Record<string, unknown> = {};

  for (const [key, nested] of Object.entries(record)) {
    if (isSensitiveAuditKey(key)) {
      next[key] = "[REDACTED]";
    } else {
      next[key] = redactAuditValue(nested);
    }
  }

  return next;
}

async function getAuditReadPolicy(options: TenantScopedOptions = {}) {
  const rawSettings = (await getModuleSettings("audit", options))?.values;
  const settings =
    rawSettings && typeof rawSettings === "object"
      ? (rawSettings as Record<string, unknown>)
      : {};

  return {
    retentionDays:
      typeof settings.retentionDays === "number" && settings.retentionDays > 0
        ? settings.retentionDays
        : 365,
    redactSensitiveFields:
      typeof settings.redactSensitiveFields === "boolean"
        ? settings.redactSensitiveFields
        : true
  };
}

export async function listAuditEvents(options: ListAuditEventsOptions = {}) {
  const {
    limit = 100,
    action,
    entity,
    entityId,
    actorId,
    deniedOnly,
    since,
    until,
    request,
    tenantId: tenantIdOverride
  } = options;
  const tenantId = await resolveTenantId({ request, tenantId: tenantIdOverride });
  const events = await auditAdapter.getEvents();
  const { retentionDays, redactSensitiveFields } = await getAuditReadPolicy({
    request,
    tenantId
  });
  const sinceTs = since ? Date.parse(since) : Number.NaN;
  const untilTs = until ? Date.parse(until) : Number.NaN;
  const retentionCutoffTs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

  const filtered = events.filter((event) => {
    if (action && event.action !== action) {
      return false;
    }

    if (entity && event.entity !== entity) {
      return false;
    }

    if (entityId && event.entityId !== entityId) {
      return false;
    }

    if (actorId && event.actorId !== actorId) {
      return false;
    }

    if (deniedOnly && event.action !== "authz.denied") {
      return false;
    }

    const eventTenantIdRaw = event.metadata?.tenantId;
    const eventTenantId =
      typeof eventTenantIdRaw === "string" && eventTenantIdRaw.trim().length > 0
        ? eventTenantIdRaw.trim()
        : null;

    if (eventTenantId && eventTenantId !== tenantId) {
      return false;
    }

    if (!eventTenantId && tenantId !== "default-tenant") {
      return false;
    }

    const eventTs = extractEventTimestamp(event);

    if (!Number.isNaN(eventTs) && eventTs < retentionCutoffTs) {
      return false;
    }

    if (!Number.isNaN(sinceTs) && !Number.isNaN(eventTs) && eventTs < sinceTs) {
      return false;
    }

    if (!Number.isNaN(untilTs) && !Number.isNaN(eventTs) && eventTs > untilTs) {
      return false;
    }

    return true;
  });

  const sanitized = filtered.map((event) => ({
    ...event,
    metadata: redactSensitiveFields
      ? (redactAuditValue(normalizeAuditMetadata(event.metadata)) as Record<string, unknown>)
      : normalizeAuditMetadata(event.metadata)
  }));

  if (limit <= 0) {
    return sanitized;
  }

  return sanitized.slice(-limit).reverse();
}

export async function summarizeAuditEvents(options: ListAuditEventsOptions = {}) {
  const events = await listAuditEvents({ ...options, limit: 0 });

  const byAction: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  const byActor: Record<string, number> = {};

  for (const event of events) {
    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
    byEntity[event.entity] = (byEntity[event.entity] ?? 0) + 1;
    byActor[event.actorId] = (byActor[event.actorId] ?? 0) + 1;
  }

  return {
    total: events.length,
    byAction,
    byEntity,
    byActor
  };
}

export async function recordAdminAuditEvent(options: {
  request?: Request;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
  tenantId?: string;
}) {
  let actorId = "unknown";
  const tenantId = await resolveTenantId({
    request: options.request,
    tenantId: options.tenantId
  });

  try {
    const { user } = await getCurrentUserContext(options.request);
    actorId = user.id;
  } catch {
    actorId = "unknown";
  }

  await auditAdapter.record({
    actorId,
    action: options.action,
    entity: options.entity,
    entityId: options.entityId,
    metadata: {
      ...(options.metadata ?? {}),
      tenantId,
      at:
        typeof options.metadata?.at === "string"
          ? options.metadata.at
          : new Date().toISOString()
    }
  });
}

export async function getModuleRuntimeView(
  moduleId: string,
  options: DashboardModelOptions = {}
) {
  const model = await buildDashboardModel(options);
  const module = model.modules.find((candidate) => candidate.id === moduleId);
  const settings = await getModuleSettings(moduleId, { request: options.request });

  return {
    module: module ?? null,
    settings,
    user: model.user,
    security: model.security,
    enabledFlags: model.enabledFlags
  };
}

export async function getCurrentUserContext(request?: Request) {
  const requestUser = await getRequestScopedUser(request);
  const user = requestUser ?? (await authAdapter.getCurrentUser());
  if (!user) {
    throw new Error("No authenticated user available.");
  }

  const policy: UserPolicyContext = {
    role: user.role,
    permissions:
      user.permissions.length > 0
        ? user.permissions
        : ((dashboardConfig.rolePermissions[user.role] ?? []) as Permission[])
  };

  return { user, policy };
}

export function canUserReadSettings(policy: UserPolicyContext): boolean {
  return hasPermission(policy, "settings:read") || hasPermission(policy, "settings:write");
}

export function canUserAccessAdminRuntime(policy: UserPolicyContext): boolean {
  return hasPermission(policy, "dashboard:read") || hasPermission(policy, "*:*");
}

export async function canUserAccessModule(
  moduleId: string,
  options: DashboardModelOptions = {}
): Promise<boolean> {
  const model = await buildDashboardModel(options);
  return model.modules.some((module) => module.id === moduleId);
}

export function canUserMutateSettings(policy: UserPolicyContext): boolean {
  if (policy.role === "viewer") {
    return false;
  }

  return hasPermission(policy, "settings:write") || hasPermission(policy, "*:*");
}

export function getProfileCatalog() {
  return listModulePacks().map((pack) => ({
    id: pack.id,
    label: pack.label,
    forcedFlags: pack.forcedFlags ?? {}
  }));
}

export async function buildDashboardModel(options: DashboardModelOptions = {}) {
  const { user, policy } = await getCurrentUserContext(options.request);
  const businessProfile = resolveBusinessProfile(
    options.profileOverride ?? process.env.ADMIN_BUSINESS_PROFILE
  );
  await ensureSettingsRegistryInitialized();

  const staticPlugins = getStaticPlugins(pluginSecurityPolicy.signingSecret ?? "");
  const runtimePlugins = await getRuntimePlugins();

  const runtimeModel = await buildRuntimeDashboardModel<NavigationItem, ShellModel>({
    config: dashboardConfig,
    user: {
      id: user.id,
      tenantId: user.tenantId
    },
    policy,
    staticPlugins,
    runtimePlugins,
    pluginSecurityPolicy,
    applyFlags: (flags) => applyPackFlags(flags, businessProfile),
    filterModules: (modules) => filterModulesByPack(modules, businessProfile),
    buildNavigation,
    buildShell: (navigation) => buildShellModel(navigation, "/")
  });

  const enabledFlags = runtimeModel.enabledFlags;
  const profiledModules = runtimeModel.modules;
  const navigation = runtimeModel.navigation;
  const shell = runtimeModel.shell;
  const pluginCompatibility = runtimeModel.pluginCompatibility;

  const tenantScopedLastContextKey = buildTenantScopedKey(
    "runtime:lastContext",
    normalizeTenantId(user.tenantId)
  );

  await dataAdapter.mutate(tenantScopedLastContextKey, {
    userId: user.id,
    tenantId: user.tenantId,
    role: user.role,
    at: new Date().toISOString()
  });

  const unsubscribe = realtimeAdapter.subscribe("admin.activity", async () => {
    await auditAdapter.record({
      actorId: user.id,
      action: "system.heartbeat",
      entity: "runtime",
      entityId: "dashboard",
      metadata: { at: new Date().toISOString() }
    });
  });

  unsubscribe();

  const lastContext = await dataAdapter.query<Record<string, unknown>>(
    tenantScopedLastContextKey
  );

  const settingsSnapshots = await listModuleSettings({ request: options.request });
  const userLayout = await getUserDashboardLayout({ request: options.request });
  const moduleCatalog = buildModuleCapabilityCatalog(profiledModules);
  const auditEvents = await listAuditEvents({
    request: options.request,
    limit: 0
  });

  return {
    user,
    policy,
    enabledFlags,
    themeTokens: resolveThemeTokens(dashboardTheme),
    modules: profiledModules,
    profile: {
      id: businessProfile,
      label: getModulePack(businessProfile).label
    },
    navigation,
    shell,
    pluginCounts: runtimeModel.pluginCounts,
    pluginExecutionPlan: runtimeModel.pluginExecutionPlan,
    pluginCompatibility,
    pluginRolloutSummary: buildPluginRolloutSummary(pluginCompatibility),
    security: {
      strictSignatures: Boolean(pluginSecurityPolicy.strictSignatures),
      allowlistEntries: pluginSecurityPolicy.allowedPluginIds?.length ?? 0,
      acceptedSigningKeys:
        [pluginSecurityPolicy.signingSecret, ...(pluginSecurityPolicy.signingSecrets ?? [])]
          .filter(Boolean)
          .length
    },
    auditEvents,
    settingsSnapshots,
    userLayout,
    moduleCatalog,
    runtimeState: lastContext
  };
}

export async function getRuntimeHealth(options: DashboardModelOptions = {}) {
  const runtimeModel = await buildDashboardModel(options);
  const tenantId = normalizeTenantId(runtimeModel.user.tenantId);
  const healthProbeKey = buildTenantScopedKey("runtime:healthProbe", tenantId);

  return collectRuntimeHealth({
    pluginRuntimeReady:
      runtimeModel.pluginCounts.static + runtimeModel.pluginCounts.runtime > 0,
    settingsRegistryReady: runtimeModel.settingsSnapshots.length > 0,
    probeDataAdapterWrite: async () => {
      await dataAdapter.mutate(healthProbeKey, {
        at: new Date().toISOString()
      });
    },
    probeDataAdapterRead: async () => {
      await dataAdapter.query(healthProbeKey);
    },
    probeAuditWrite: async () => {
      await auditAdapter.record({
        actorId: "runtime-health",
        action: "health.check",
        entity: "runtime",
        entityId: "health-probe"
      });
    }
  });
}
