import { hasPermission } from "@universal-admin/core";
import {
  type AutomationReadinessThresholds,
  buildAuditWindowAnalytics,
  compareAuditWindows,
  deriveAutomationReadiness,
  deriveIntelligenceAlerts,
  deriveIntelligenceKpis
} from "./intelligence";
import { deriveAutomationSlo, type AutomationSloThresholds } from "./intelligence-slo";
import { extractAutomationReadinessThresholds } from "./intelligence-thresholds";
import {
  buildDashboardModel,
  getCurrentUserContext,
  getModuleSettings,
  listAuditEvents,
  listIntelligenceAlertDeliveries,
  listIntelligenceDispatchSchedules
} from "./runtime";

export function normalizeIntelligenceWindowDays(value: unknown): number {
  const parsed =
    typeof value === "number"
      ? value
      : Number.parseInt(typeof value === "string" ? value : "7", 10);

  if (!Number.isFinite(parsed)) {
    return 7;
  }

  return Math.max(3, Math.min(Math.trunc(parsed), 30));
}

export async function buildIntelligenceDispatchSnapshot(options: {
  request: Request;
  profile?: string;
  windowDays: number;
}) {
  const windowDays = normalizeIntelligenceWindowDays(options.windowDays);
  const windowStartIso = new Date(Date.now() - windowDays * 24 * 60 * 60 * 1000).toISOString();
  const previousWindowStartIso = new Date(
    Date.now() - windowDays * 2 * 24 * 60 * 60 * 1000
  ).toISOString();

  const [runtime, policyContext] = await Promise.all([
    buildDashboardModel({
      profileOverride: options.profile,
      request: options.request
    }),
    getCurrentUserContext(options.request)
  ]);

  if (!hasPermission(policyContext.policy, "audit:read")) {
    throw new Error("audit-access-required");
  }

  const [auditEvents, previousAuditEvents] = await Promise.all([
    listAuditEvents({
      limit: 0,
      since: windowStartIso,
      request: options.request
    }),
    listAuditEvents({
      limit: 0,
      since: previousWindowStartIso,
      until: windowStartIso,
      request: options.request
    })
  ]);

  const current = buildAuditWindowAnalytics(auditEvents, { windowDays });
  const previous = buildAuditWindowAnalytics(previousAuditEvents, { windowDays });
  const comparison = compareAuditWindows(current, previous);

  const kpis = deriveIntelligenceKpis({
    moduleCount: runtime.modules.length,
    pluginCount: runtime.pluginCounts.static + runtime.pluginCounts.runtime,
    enabledFlagCount: Object.values(runtime.enabledFlags).filter(Boolean).length,
    strictSignatures: runtime.security.strictSignatures,
    acceptedSigningKeys: runtime.security.acceptedSigningKeys,
    auditAnalytics: current
  });

  const alerts = deriveIntelligenceAlerts({
    current,
    comparison,
    kpis
  });

  return {
    runtime,
    windowDays,
    windowStartIso,
    alerts
  };
}

export async function buildIntelligenceAutomationPulse(options: {
  request: Request;
  deliveryLimit?: number;
}) {
  const [deliveries, schedules, intelligenceSettingsSnapshot] = await Promise.all([
    listIntelligenceAlertDeliveries({
      request: options.request,
      limit: typeof options.deliveryLimit === "number" ? options.deliveryLimit : 25
    }),
    listIntelligenceDispatchSchedules({
      request: options.request
    }),
    getModuleSettings("intelligence", {
      request: options.request
    })
  ]);

  const intelligenceSettings =
    intelligenceSettingsSnapshot?.values &&
    typeof intelligenceSettingsSnapshot.values === "object"
      ? (intelligenceSettingsSnapshot.values as Record<string, unknown>)
      : {};

  const thresholds: Partial<AutomationReadinessThresholds> =
    extractAutomationReadinessThresholds(intelligenceSettings);

  const sloThresholds: Partial<AutomationSloThresholds> = {
    maxFailureRatePct:
      typeof intelligenceSettings.sloMaxFailureRatePct === "number"
        ? intelligenceSettings.sloMaxFailureRatePct
        : undefined,
    minSuccessRatePct:
      typeof intelligenceSettings.sloMinSuccessRatePct === "number"
        ? intelligenceSettings.sloMinSuccessRatePct
        : undefined,
    maxOverdueSchedules:
      typeof intelligenceSettings.sloMaxOverdueSchedules === "number"
        ? intelligenceSettings.sloMaxOverdueSchedules
        : undefined,
    maxStaleLagMinutes:
      typeof intelligenceSettings.sloMaxStaleLagMinutes === "number"
        ? intelligenceSettings.sloMaxStaleLagMinutes
        : undefined,
    maxP95Attempts:
      typeof intelligenceSettings.sloMaxP95Attempts === "number"
        ? intelligenceSettings.sloMaxP95Attempts
        : undefined,
    maxFailureRateDeltaPct:
      typeof intelligenceSettings.sloMaxFailureRateDeltaPct === "number"
        ? intelligenceSettings.sloMaxFailureRateDeltaPct
        : undefined
  };

  const readiness = deriveAutomationReadiness({
    deliveries: deliveries.map((item) => ({
      status: item.status,
      attempts: item.attempts,
      at: item.at
    })),
    schedules: schedules.map((item) => ({
      enabled: item.enabled,
      nextRunAt: item.nextRunAt
    })),
    thresholds
  });

  const sortedDeliveries = [...deliveries].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  const midpoint = Math.floor(sortedDeliveries.length / 2);
  const previousWindowDeliveries =
    midpoint > 0 ? sortedDeliveries.slice(midpoint) : [];

  const previousReadiness =
    previousWindowDeliveries.length > 0
      ? deriveAutomationReadiness({
          deliveries: previousWindowDeliveries.map((item) => ({
            status: item.status,
            attempts: item.attempts,
            at: item.at
          })),
          schedules: schedules.map((item) => ({
            enabled: item.enabled,
            nextRunAt: item.nextRunAt
          })),
          thresholds
        })
      : undefined;

  const slo = deriveAutomationSlo({
    readiness,
    previousReadiness,
    thresholds: sloThresholds
  });

  return {
    generatedAt: new Date().toISOString(),
    readiness,
    slo,
    deliveries,
    schedules
  };
}
