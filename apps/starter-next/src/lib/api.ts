const BASE = "/api/admin";

async function buildApiError(res: Response): Promise<Error> {
  const text = await res.text();

  try {
    const payload = JSON.parse(text) as { error?: string; message?: string };
    const message = payload.error ?? payload.message;
    if (message) {
      return new Error(`API error ${res.status}: ${message}`);
    }
  } catch {
    // Fall back to raw text when payload is not JSON.
  }

  return new Error(`API error ${res.status}: ${text}`);
}

async function fetchApi<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  if (!res.ok) {
    throw await buildApiError(res);
  }
  return res.json() as Promise<T>;
}

// Types matching the real API responses
export interface AuditEvent {
  id: string;
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  timestamp?: string;
  metadata?: Record<string, unknown>;
}

export function getAuditEventTimestamp(event: AuditEvent): string | undefined {
  if (typeof event.timestamp === "string" && event.timestamp.trim().length > 0) {
    return event.timestamp;
  }

  const at = event.metadata?.at;
  if (typeof at === "string" && at.trim().length > 0) {
    return at;
  }

  const metadataTimestamp = event.metadata?.timestamp;
  if (typeof metadataTimestamp === "string" && metadataTimestamp.trim().length > 0) {
    return metadataTimestamp;
  }

  return undefined;
}

export interface AuditSummary {
  kpis: {
    healthScore: number;
    reliabilityScore: number;
    velocityScore: number;
    securityScore: number;
  };
  windowAnalytics: {
    windowDays: number;
    totalEvents: number;
    deniedEvents: number;
    incidents: number;
    reliabilityPercent: number;
    riskLoad: number;
    dailyBreakdown: Array<{
      date: string;
      total: number;
      denied: number;
      incidents: number;
      reliability: number;
      riskLoad: number;
    }>;
    topActions: Array<{ action: string; count: number }>;
    topEntities: Array<{ entity: string; count: number }>;
    topActors: Array<{ actorId: string; count: number }>;
  };
}

export interface RuntimeModel {
  modules: Array<{
    id: string;
    title: string;
    route: string;
    category?: string;
    icon?: string;
    permissions?: string[];
    capabilities?: Array<{
      id: string;
      label?: string;
      maturity?: string;
      operations?: string[];
    }>;
    dataSources?: Array<{
      id: string;
      type: string;
      entity: string;
      realtime?: boolean;
    }>;
    order?: number;
  }>;
  plugins: {
    static: number;
    runtime: number;
    compatibility: Array<{
      pluginId: string;
      version: string;
      rolloutStage?: "enabled" | "canary" | "disabled";
      rolloutEnabled?: boolean;
      compatible: boolean;
      dependencies?: string[];
    }>;
  };
  flags: Record<string, boolean>;
  security: {
    strictSignatures: boolean;
    acceptedSigningKeys: number;
    allowlistEntries: number;
  };
  health: {
    pluginsReady: boolean;
    settingsReady: boolean;
    adapters: Record<string, { latencyMs: number; status: string }>;
  };
}

export interface IntelligenceData {
  kpis: {
    healthScore: number;
    reliabilityScore: number;
    velocityScore: number;
    securityScore: number;
  };
  alerts: Array<{
    id: string;
    severity: string;
    title: string;
    description: string;
    timestamp: string;
  }>;
  recommendations: Array<{
    id: string;
    category: string;
    title: string;
    description: string;
    impact: string;
  }>;
  sloReport?: {
    releaseReady: boolean;
    checks: Array<{
      name: string;
      passed: boolean;
      actual: number;
      threshold: number;
    }>;
  };
}

export interface AlertPolicy {
  id: string;
  name: string;
  webhookUrl: string;
  severities: Array<"low" | "medium" | "high">;
  retryLimit: number;
  enabled: boolean;
  version: number;
  updatedAt: string;
}

export interface DispatchSchedule {
  id: string;
  name: string;
  profileId: string;
  cadenceMinutes: number;
  windowDays: number;
  cooldownMinutes: number;
  enabled: boolean;
  version: number;
  nextRunAt: string;
  lastRunAt?: string;
  updatedAt: string;
}

export interface Delivery {
  policyId: string;
  windowToken: string;
  alertId: string;
  idempotencyKey: string;
  status: string;
  attempts: number;
  deliveredAt?: string;
  error?: string;
  at: string;
}

export interface CreateAlertPolicyInput {
  id?: string;
  name: string;
  webhookUrl: string;
  severities: Array<"low" | "medium" | "high">;
  retryLimit: number;
  enabled: boolean;
}

export interface UpdateAlertPolicyInput extends CreateAlertPolicyInput {
  id: string;
  expectedVersion?: number;
}

export interface CreateDispatchScheduleInput {
  id?: string;
  name: string;
  profileId: string;
  cadenceMinutes: number;
  windowDays: number;
  cooldownMinutes: number;
  enabled: boolean;
}

export interface UpdateDispatchScheduleInput extends CreateDispatchScheduleInput {
  id: string;
  expectedVersion?: number;
}

export interface SettingsSnapshot {
  moduleId: string;
  values: Record<string, unknown>;
  version?: number;
  schemaVersion?: number;
}

export interface HealthStatus {
  status: "healthy" | "degraded";
  pluginsReady: boolean;
  settingsReady: boolean;
  adapters: Record<string, { latencyMs: number; status: string }>;
  observedAt?: string;
}

interface RawHealthResponse {
  status: "healthy" | "degraded";
  checks: {
    pluginRuntimeReady: boolean;
    settingsRegistryReady: boolean;
    dataAdapterWriteMs: number;
    dataAdapterReadMs: number;
    auditAdapterWriteMs: number;
  };
  observedAt: string;
}

interface AuditEventsResponse {
  count: number;
  events: AuditEvent[];
}

interface PoliciesResponse {
  policies: AlertPolicy[];
}

interface SchedulesResponse {
  schedules: DispatchSchedule[];
}

interface DeliveriesResponse {
  deliveries: Delivery[];
}

interface IntelligenceResponse {
  kpis?: IntelligenceData["kpis"];
  insights?: {
    alerts?: IntelligenceData["alerts"];
    recommendations?: IntelligenceData["recommendations"];
  };
  automation?: {
    slo?: {
      releaseReady: boolean;
      checks: Array<{
        label: string;
        status: "pass" | "fail";
        value: number | null;
        target: number;
      }>;
    };
  };
}

function normalizeIntelligenceData(payload: IntelligenceResponse): IntelligenceData {
  const defaultKpis: IntelligenceData["kpis"] = {
    healthScore: 0,
    reliabilityScore: 0,
    velocityScore: 0,
    securityScore: 0,
  };

  const slo = payload.automation?.slo;

  return {
    kpis: payload.kpis ?? defaultKpis,
    alerts: payload.insights?.alerts ?? [],
    recommendations: payload.insights?.recommendations ?? [],
    sloReport: slo
      ? {
          releaseReady: Boolean(slo.releaseReady),
          checks: (slo.checks ?? []).map((check) => ({
            name: check.label,
            passed: check.status === "pass",
            actual: typeof check.value === "number" ? check.value : 0,
            threshold: check.target,
          })),
        }
      : undefined,
  };
}

function normalizeHealthStatus(payload: RawHealthResponse): HealthStatus {
  return {
    status: payload.status,
    pluginsReady: payload.checks.pluginRuntimeReady,
    settingsReady: payload.checks.settingsRegistryReady,
    adapters: {
      dataWrite: {
        latencyMs: payload.checks.dataAdapterWriteMs,
        status: payload.checks.dataAdapterWriteMs < 1000 ? "healthy" : "degraded",
      },
      dataRead: {
        latencyMs: payload.checks.dataAdapterReadMs,
        status: payload.checks.dataAdapterReadMs < 1000 ? "healthy" : "degraded",
      },
      auditWrite: {
        latencyMs: payload.checks.auditAdapterWriteMs,
        status: payload.checks.auditAdapterWriteMs < 1000 ? "healthy" : "degraded",
      },
    },
    observedAt: payload.observedAt,
  };
}

// API client methods
export const api = {
  // Runtime
  getRuntime: () => fetchApi<RuntimeModel>("/runtime"),

  // Audit
  getAuditEvents: (params?: {
    action?: string;
    entity?: string;
    actorId?: string;
    deniedOnly?: boolean;
    limit?: number;
  }) => {
    const searchParams = new URLSearchParams();
    if (params?.action) searchParams.set("action", params.action);
    if (params?.entity) searchParams.set("entity", params.entity);
    if (params?.actorId) searchParams.set("actorId", params.actorId);
    if (params?.deniedOnly) searchParams.set("deniedOnly", "true");
    if (params?.limit) searchParams.set("limit", String(params.limit));
    const qs = searchParams.toString();
    return fetchApi<AuditEventsResponse>(`/audit${qs ? `?${qs}` : ""}`).then(
      (payload) => payload.events
    );
  },
  getAuditSummary: () => fetchApi<AuditSummary>("/audit/summary"),

  // Health
  getHealth: async () => {
    const res = await fetch(`${BASE}/health`, {
      headers: {
        "Content-Type": "application/json",
      },
    });

    if (res.status !== 200 && res.status !== 503) {
      throw await buildApiError(res);
    }

    const payload = (await res.json()) as RawHealthResponse;
    return normalizeHealthStatus(payload);
  },

  // Intelligence
  getIntelligence: () =>
    fetchApi<IntelligenceResponse>("/intelligence").then(normalizeIntelligenceData),
  getDeliveries: () =>
    fetchApi<DeliveriesResponse>("/intelligence/deliveries").then(
      (payload) => payload.deliveries
    ),
  getPolicies: () =>
    fetchApi<PoliciesResponse>("/intelligence/policies").then((payload) => payload.policies),
  createPolicy: (data: CreateAlertPolicyInput) =>
    fetchApi<AlertPolicy>("/intelligence/policies", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updatePolicy: (data: UpdateAlertPolicyInput) =>
    fetchApi<AlertPolicy>("/intelligence/policies", {
      method: "PUT",
      body: JSON.stringify({
        id: data.id,
        name: data.name,
        webhookUrl: data.webhookUrl,
        severities: data.severities,
        retryLimit: data.retryLimit,
        enabled: data.enabled,
        expectedVersion: data.expectedVersion,
      }),
    }),
  deletePolicy: (policyId: string, expectedVersion?: number) =>
    fetchApi<{ deleted: boolean; policyId: string }>("/intelligence/policies", {
      method: "DELETE",
      body: JSON.stringify({ policyId, expectedVersion }),
    }),
  getSchedules: () =>
    fetchApi<SchedulesResponse>("/intelligence/schedules").then(
      (payload) => payload.schedules
    ),
  createSchedule: (data: CreateDispatchScheduleInput) =>
    fetchApi<DispatchSchedule>("/intelligence/schedules", {
      method: "POST",
      body: JSON.stringify(data),
    }),
  updateSchedule: (data: UpdateDispatchScheduleInput) =>
    fetchApi<DispatchSchedule>("/intelligence/schedules", {
      method: "PUT",
      body: JSON.stringify({
        id: data.id,
        name: data.name,
        profileId: data.profileId,
        cadenceMinutes: data.cadenceMinutes,
        windowDays: data.windowDays,
        cooldownMinutes: data.cooldownMinutes,
        enabled: data.enabled,
        expectedVersion: data.expectedVersion,
      }),
    }),
  deleteSchedule: (scheduleId: string, expectedVersion?: number) =>
    fetchApi<{ deleted: boolean; scheduleId: string }>("/intelligence/schedules", {
      method: "DELETE",
      body: JSON.stringify({ scheduleId, expectedVersion }),
    }),
  dispatch: (payload: { profile?: string; windowDays?: number; windowToken?: string }) =>
    fetchApi<{ deliveries: Delivery[] }>("/intelligence/dispatch", {
      method: "POST",
      body: JSON.stringify(payload),
    }),

  // Settings
  getSettings: (moduleId: string) =>
    fetchApi<SettingsSnapshot>(`/settings/${encodeURIComponent(moduleId)}`),
  updateSettings: (moduleId: string, values: Record<string, unknown>) =>
    fetchApi<SettingsSnapshot>(`/settings/${encodeURIComponent(moduleId)}`, {
      method: "PATCH",
      body: JSON.stringify(values),
    }),
  getSettingsSchema: () =>
    fetchApi<Array<{ moduleId: string; schema: Record<string, unknown> }>>("/settings/schema"),

  // Policy
  getAdminPolicy: () => fetchApi<Record<string, unknown>>("/policy"),
};
