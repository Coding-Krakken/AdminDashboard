import type { AuditEvent } from "@universal-admin/adapters";

export interface AuditWindowAnalytics {
  windowDays: number;
  total: number;
  denied: number;
  byAction: Record<string, number>;
  byEntity: Record<string, number>;
  byActor: Record<string, number>;
  trendSeries: {
    throughput: number[];
    reliability: number[];
    riskLoad: number[];
  };
  topActions: Array<{ action: string; count: number }>;
  topEntities: Array<{ entity: string; count: number }>;
}

export interface IntelligenceComparison {
  throughputDeltaPct: number;
  reliabilityDelta: number;
  riskDeltaPct: number;
}

export interface IntelligenceAlert {
  id: string;
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

export interface IntelligenceRecommendation {
  id: string;
  priority: "p1" | "p2" | "p3";
  title: string;
  detail: string;
  endpoint: string;
}

export interface DailyAuditBreakdown {
  day: string;
  total: number;
  denied: number;
  incidents: number;
  reliability: number;
  riskLoad: number;
}

export interface IntelligenceDeliverySnapshot {
  status: "delivered" | "failed" | "skipped";
  attempts: number;
  at: string;
}

export interface IntelligenceScheduleSnapshot {
  enabled: boolean;
  nextRunAt: string;
}

export interface AutomationReadiness {
  delivery: {
    total: number;
    delivered: number;
    failed: number;
    skipped: number;
    successRatePct: number;
    failureRatePct: number;
    p95Attempts: number;
    staleLagMinutes: number | null;
  };
  schedules: {
    total: number;
    enabled: number;
    overdue: number;
    maxOverdueMinutes: number;
  };
  status: "healthy" | "warning" | "critical";
}

export interface AutomationReadinessThresholds {
  warningFailureRatePct: number;
  criticalFailureRatePct: number;
  warningOverdueMinutes: number;
  criticalOverdueMinutes: number;
  warningSuccessRatePct: number;
}

function clampPercent(value: number): number {
  return Math.max(0, Math.min(value, 100));
}

function normalizedWindowDays(input: number): number {
  if (!Number.isFinite(input)) {
    return 7;
  }

  return Math.max(3, Math.min(Math.trunc(input), 30));
}

function eventTimestamp(event: AuditEvent): number {
  const atRaw =
    typeof event.metadata?.at === "string"
      ? event.metadata.at
      : typeof event.metadata?.timestamp === "string"
        ? event.metadata.timestamp
        : null;

  if (!atRaw) {
    return Number.NaN;
  }

  return Date.parse(atRaw);
}

function bucketStartUtc(ts: number): number {
  const date = new Date(ts);
  return Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
}

function isoDayFromUtcBucket(ts: number): string {
  return new Date(ts).toISOString().slice(0, 10);
}

function percentile(values: number[], ratio: number): number {
  if (values.length === 0) {
    return 0;
  }

  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * ratio) - 1));
  return sorted[index];
}

export function deriveAutomationReadiness(options: {
  deliveries: IntelligenceDeliverySnapshot[];
  schedules: IntelligenceScheduleSnapshot[];
  now?: Date;
  thresholds?: Partial<AutomationReadinessThresholds>;
}): AutomationReadiness {
  const thresholds: AutomationReadinessThresholds = {
    warningFailureRatePct: 3,
    criticalFailureRatePct: 10,
    warningOverdueMinutes: 30,
    criticalOverdueMinutes: 120,
    warningSuccessRatePct: 97,
    ...(options.thresholds ?? {})
  };

  const now = options.now ?? new Date();
  const nowMs = now.getTime();

  const delivered = options.deliveries.filter((item) => item.status === "delivered").length;
  const failed = options.deliveries.filter((item) => item.status === "failed").length;
  const skipped = options.deliveries.filter((item) => item.status === "skipped").length;
  const attempted = delivered + failed;

  const successRatePct = attempted > 0 ? clampPercent((delivered / attempted) * 100) : 100;
  const failureRatePct = attempted > 0 ? clampPercent((failed / attempted) * 100) : 0;
  const p95Attempts = percentile(
    options.deliveries.map((item) => Math.max(0, item.attempts)),
    0.95
  );

  const newestDeliveryMs = options.deliveries
    .map((item) => Date.parse(item.at))
    .filter((value) => !Number.isNaN(value))
    .sort((a, b) => b - a)[0];
  const staleLagMinutes =
    newestDeliveryMs === undefined ? null : Math.max(0, Math.trunc((nowMs - newestDeliveryMs) / 60000));

  const enabledSchedules = options.schedules.filter((item) => item.enabled);
  const overdueMinutes = enabledSchedules
    .map((schedule) => {
      const nextRunMs = Date.parse(schedule.nextRunAt);
      if (Number.isNaN(nextRunMs) || nextRunMs >= nowMs) {
        return 0;
      }

      return Math.max(0, Math.trunc((nowMs - nextRunMs) / 60000));
    })
    .filter((value) => value > 0);

  const overdue = overdueMinutes.length;
  const maxOverdueMinutes = overdueMinutes.length > 0 ? Math.max(...overdueMinutes) : 0;

  let status: AutomationReadiness["status"] = "healthy";
  if (
    failureRatePct > thresholds.criticalFailureRatePct ||
    maxOverdueMinutes > thresholds.criticalOverdueMinutes
  ) {
    status = "critical";
  } else if (
    failureRatePct > thresholds.warningFailureRatePct ||
    maxOverdueMinutes > thresholds.warningOverdueMinutes ||
    successRatePct < thresholds.warningSuccessRatePct
  ) {
    status = "warning";
  }

  return {
    delivery: {
      total: options.deliveries.length,
      delivered,
      failed,
      skipped,
      successRatePct,
      failureRatePct,
      p95Attempts,
      staleLagMinutes
    },
    schedules: {
      total: options.schedules.length,
      enabled: enabledSchedules.length,
      overdue,
      maxOverdueMinutes
    },
    status
  };
}

export function buildAuditWindowAnalytics(
  events: AuditEvent[],
  options: { windowDays?: number; now?: Date } = {}
): AuditWindowAnalytics {
  const windowDays = normalizedWindowDays(options.windowDays ?? 7);
  const now = options.now ?? new Date();
  const todayBucket = bucketStartUtc(now.getTime());

  const bucketStarts = Array.from({ length: windowDays }, (_, index) => {
    return todayBucket - (windowDays - 1 - index) * 24 * 60 * 60 * 1000;
  });

  const throughput = bucketStarts.map(() => 0);
  const deniedCounts = bucketStarts.map(() => 0);
  const incidentCounts = bucketStarts.map(() => 0);

  const byAction: Record<string, number> = {};
  const byEntity: Record<string, number> = {};
  const byActor: Record<string, number> = {};

  const oldestBucket = bucketStarts[0];
  const newestBucket = bucketStarts[bucketStarts.length - 1] + 24 * 60 * 60 * 1000;

  for (const event of events) {
    const ts = eventTimestamp(event);
    if (Number.isNaN(ts)) {
      continue;
    }

    if (ts < oldestBucket || ts >= newestBucket) {
      continue;
    }

    const start = bucketStartUtc(ts);
    const bucketIndex = Math.floor((start - oldestBucket) / (24 * 60 * 60 * 1000));

    if (bucketIndex < 0 || bucketIndex >= windowDays) {
      continue;
    }

    throughput[bucketIndex] += 1;

    if (event.action === "authz.denied") {
      deniedCounts[bucketIndex] += 1;
    }

    if (event.entity === "incident" || event.action.startsWith("incident.")) {
      incidentCounts[bucketIndex] += 1;
    }

    byAction[event.action] = (byAction[event.action] ?? 0) + 1;
    byEntity[event.entity] = (byEntity[event.entity] ?? 0) + 1;
    byActor[event.actorId] = (byActor[event.actorId] ?? 0) + 1;
  }

  const reliability = throughput.map((total, index) => {
    if (total === 0) {
      return 100;
    }

    const deniedRate = deniedCounts[index] / total;
    return clampPercent(100 - deniedRate * 100);
  });

  const riskLoad = throughput.map((_, index) => {
    return deniedCounts[index] * 8 + incidentCounts[index] * 5;
  });

  const total = throughput.reduce((sum, value) => sum + value, 0);
  const denied = deniedCounts.reduce((sum, value) => sum + value, 0);

  const topActions = Object.entries(byAction)
    .map(([action, count]) => ({ action, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const topEntities = Object.entries(byEntity)
    .map(([entity, count]) => ({ entity, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  return {
    windowDays,
    total,
    denied,
    byAction,
    byEntity,
    byActor,
    trendSeries: {
      throughput,
      reliability,
      riskLoad
    },
    topActions,
    topEntities
  };
}

export function deriveIntelligenceKpis(options: {
  moduleCount: number;
  pluginCount: number;
  enabledFlagCount: number;
  strictSignatures: boolean;
  acceptedSigningKeys: number;
  auditAnalytics: AuditWindowAnalytics | null;
}) {
  const denialRate =
    options.auditAnalytics && options.auditAnalytics.total > 0
      ? options.auditAnalytics.denied / options.auditAnalytics.total
      : 0;

  const avgRisk =
    options.auditAnalytics && options.auditAnalytics.trendSeries.riskLoad.length > 0
      ? options.auditAnalytics.trendSeries.riskLoad.reduce((sum, value) => sum + value, 0) /
        options.auditAnalytics.trendSeries.riskLoad.length
      : 0;

  const latestReliability =
    options.auditAnalytics && options.auditAnalytics.trendSeries.reliability.length > 0
      ? options.auditAnalytics.trendSeries.reliability[
          options.auditAnalytics.trendSeries.reliability.length - 1
        ]
      : 96;

  return {
    moduleCount: options.moduleCount,
    pluginCount: options.pluginCount,
    enabledFlagCount: options.enabledFlagCount,
    healthScore: clampPercent(95 - denialRate * 55 - avgRisk * 0.35),
    reliabilityScore: clampPercent(latestReliability),
    velocityScore: clampPercent(
      72 + options.enabledFlagCount * 2 + options.pluginCount * 1.5 - avgRisk * 0.15
    ),
    securityScore: clampPercent(
      (options.strictSignatures ? 78 : 55) +
        Math.min(options.acceptedSigningKeys * 7, 14) -
        denialRate * 40
    )
  };
}

function safeDeltaPercent(current: number, previous: number): number {
  if (previous === 0) {
    return current === 0 ? 0 : 100;
  }

  return ((current - previous) / previous) * 100;
}

export function compareAuditWindows(
  current: AuditWindowAnalytics,
  previous: AuditWindowAnalytics | null
): IntelligenceComparison {
  if (!previous) {
    return {
      throughputDeltaPct: 0,
      reliabilityDelta: 0,
      riskDeltaPct: 0
    };
  }

  const currentReliability =
    current.trendSeries.reliability.length > 0
      ? current.trendSeries.reliability[current.trendSeries.reliability.length - 1]
      : 100;

  const previousReliability =
    previous.trendSeries.reliability.length > 0
      ? previous.trendSeries.reliability[previous.trendSeries.reliability.length - 1]
      : 100;

  const currentRisk = current.trendSeries.riskLoad.reduce((sum, value) => sum + value, 0);
  const previousRisk = previous.trendSeries.riskLoad.reduce((sum, value) => sum + value, 0);

  return {
    throughputDeltaPct: safeDeltaPercent(current.total, previous.total),
    reliabilityDelta: currentReliability - previousReliability,
    riskDeltaPct: safeDeltaPercent(currentRisk, previousRisk)
  };
}

export function deriveIntelligenceAlerts(options: {
  current: AuditWindowAnalytics;
  comparison: IntelligenceComparison;
  kpis: ReturnType<typeof deriveIntelligenceKpis>;
}): IntelligenceAlert[] {
  const alerts: IntelligenceAlert[] = [];

  if (options.kpis.securityScore < 70) {
    alerts.push({
      id: "security-score-low",
      severity: "high",
      title: "Security posture degraded",
      detail: `Security score dropped to ${options.kpis.securityScore.toFixed(1)}%.`
    });
  }

  if (options.comparison.reliabilityDelta < -3) {
    alerts.push({
      id: "reliability-regression",
      severity: "high",
      title: "Reliability regression detected",
      detail: `Reliability declined ${Math.abs(options.comparison.reliabilityDelta).toFixed(
        1
      )} points compared to the previous window.`
    });
  }

  if (options.comparison.riskDeltaPct > 25) {
    alerts.push({
      id: "risk-escalation",
      severity: "medium",
      title: "Risk load increasing",
      detail: `Risk index increased ${options.comparison.riskDeltaPct.toFixed(
        1
      )}% window-over-window.`
    });
  }

  if ((options.current.byAction["authz.denied"] ?? 0) > 0) {
    alerts.push({
      id: "authorization-pressure",
      severity: "medium",
      title: "Authorization denials observed",
      detail: `${options.current.byAction["authz.denied"]} denied admin actions recorded in this window.`
    });
  }

  if (options.current.total === 0) {
    alerts.push({
      id: "low-observability-signal",
      severity: "low",
      title: "No telemetry in active window",
      detail: "No audit telemetry events were observed. Validate ingest and activity paths."
    });
  }

  return alerts.slice(0, 6);
}

export function deriveIntelligenceRecommendations(options: {
  windowDays: number;
  profileId: string;
  current: AuditWindowAnalytics;
  comparison: IntelligenceComparison;
  alerts: IntelligenceAlert[];
}): IntelligenceRecommendation[] {
  const recommendations: IntelligenceRecommendation[] = [];
  const sinceIso = new Date(
    Date.now() - options.windowDays * 24 * 60 * 60 * 1000
  ).toISOString();

  if (options.alerts.some((alert) => alert.id === "reliability-regression")) {
    recommendations.push({
      id: "rec-reliability-investigation",
      priority: "p1",
      title: "Investigate reliability regression",
      detail:
        "Inspect runtime health checks and correlate with denied actions to identify degraded access paths.",
      endpoint: `/api/admin/runtime?profile=${encodeURIComponent(options.profileId)}`
    });
  }

  if (options.alerts.some((alert) => alert.id === "authorization-pressure")) {
    recommendations.push({
      id: "rec-authz-denials",
      priority: "p1",
      title: "Analyze authorization denials",
      detail:
        "Review denied admin actions and actor concentration to resolve policy friction quickly.",
      endpoint: `/api/admin/audit?deniedOnly=true&since=${encodeURIComponent(sinceIso)}`
    });
  }

  if (options.comparison.riskDeltaPct > 20) {
    recommendations.push({
      id: "rec-risk-escalation",
      priority: "p2",
      title: "Contain risk escalation",
      detail:
        "Compare top entities and actions for the active window to isolate recently elevated risk domains.",
      endpoint: `/api/admin/intelligence?profile=${encodeURIComponent(options.profileId)}&windowDays=${options.windowDays}`
    });
  }

  const settingsMutations =
    (options.current.byAction["settings.update"] ?? 0) +
    (options.current.byAction["settings.patch"] ?? 0) +
    (options.current.byAction["settings.reset"] ?? 0);

  if (settingsMutations > 0) {
    recommendations.push({
      id: "rec-settings-review",
      priority: "p2",
      title: "Review high settings mutation volume",
      detail:
        "Validate that configuration drift is intentional and confirm post-change system posture.",
      endpoint: "/api/admin/settings"
    });
  }

  if (options.current.total === 0) {
    recommendations.push({
      id: "rec-observability-probe",
      priority: "p3",
      title: "Validate telemetry ingest",
      detail:
        "No telemetry events detected. Run health probes and confirm event producers are active.",
      endpoint: "/api/admin/health"
    });
  }

  return recommendations.slice(0, 6);
}

export function buildDailyAuditBreakdown(
  events: AuditEvent[],
  options: { windowDays?: number; now?: Date } = {}
): DailyAuditBreakdown[] {
  const windowDays = normalizedWindowDays(options.windowDays ?? 7);
  const now = options.now ?? new Date();
  const todayBucket = bucketStartUtc(now.getTime());

  const buckets = Array.from({ length: windowDays }, (_, index) => {
    const bucketStart = todayBucket - (windowDays - 1 - index) * 24 * 60 * 60 * 1000;
    return {
      day: isoDayFromUtcBucket(bucketStart),
      total: 0,
      denied: 0,
      incidents: 0
    };
  });

  const bucketIndexByDay = new Map<string, number>(
    buckets.map((bucket, index) => [bucket.day, index])
  );

  for (const event of events) {
    const ts = eventTimestamp(event);
    if (Number.isNaN(ts)) {
      continue;
    }

    const day = isoDayFromUtcBucket(bucketStartUtc(ts));
    const index = bucketIndexByDay.get(day);
    if (index === undefined) {
      continue;
    }

    buckets[index].total += 1;
    if (event.action === "authz.denied") {
      buckets[index].denied += 1;
    }
    if (event.entity === "incident" || event.action.startsWith("incident.")) {
      buckets[index].incidents += 1;
    }
  }

  return buckets.map((bucket) => {
    const reliability =
      bucket.total > 0 ? clampPercent(100 - (bucket.denied / bucket.total) * 100) : 100;
    const riskLoad = bucket.denied * 8 + bucket.incidents * 5;

    return {
      ...bucket,
      reliability,
      riskLoad
    };
  });
}
