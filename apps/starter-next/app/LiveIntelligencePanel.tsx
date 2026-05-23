"use client";

import { useEffect, useMemo, useState } from "react";

interface LiveIntelligencePanelProps {
  profileId: string;
}

interface IntelligencePayload {
  generatedAt: string;
  kpis: {
    moduleCount: number;
    pluginCount: number;
    enabledFlagCount: number;
    healthScore: number;
    reliabilityScore: number;
    velocityScore: number;
    securityScore: number;
  };
  runtime: {
    modulesByCategory: Record<string, number>;
  };
  audit: {
    available: boolean;
    summary: {
      total: number;
      byAction: Record<string, number>;
      byEntity: Record<string, number>;
      byActor: Record<string, number>;
    } | null;
  };
  trendSeries: {
    weeklyThroughput: number[];
    reliability: number[];
    riskLoad: number[];
  };
  insights: {
    windowDays: number;
    comparison: {
      throughputDeltaPct: number;
      reliabilityDelta: number;
      riskDeltaPct: number;
    };
    alerts: Array<{
      id: string;
      severity: "low" | "medium" | "high";
      title: string;
      detail: string;
    }>;
    recommendations: Array<{
      id: string;
      priority: "p1" | "p2" | "p3";
      title: string;
      detail: string;
      endpoint: string;
    }>;
    topActors: Array<{
      actorId: string;
      count: number;
    }>;
    dailyBreakdown: Array<{
      day: string;
      total: number;
      denied: number;
      incidents: number;
      reliability: number;
      riskLoad: number;
    }>;
    topActions: Array<{ action: string; count: number }>;
    topEntities: Array<{ entity: string; count: number }>;
  };
  automation: {
    policyCount: number;
    enabledPolicyCount: number;
    scheduleCount: number;
    enabledScheduleCount: number;
    readiness: {
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
    };
    slo: {
      status: "pass" | "fail";
      releaseReady: boolean;
      checks: Array<{
        id: string;
        label: string;
        comparator: "<=" | ">=";
        value: number | null;
        target: number;
        status: "pass" | "fail";
        unit: "%" | "minutes" | "count" | "attempts";
        detail: string;
      }>;
    };
    policies: Array<{
      id: string;
      name: string;
      enabled: boolean;
      severities: Array<"low" | "medium" | "high">;
      retryLimit: number;
    }>;
  };
}

interface DispatchPayload {
  windowToken: string;
  deliveries: Array<{
    policyId: string;
    alertId: string;
    severity: "low" | "medium" | "high";
    idempotencyKey: string;
    status: "delivered" | "failed" | "skipped";
    attempts: number;
    error?: string;
  }>;
}

interface ManagedPolicy {
  id: string;
  name: string;
  enabled: boolean;
  severities: Array<"low" | "medium" | "high">;
  webhookUrl: string;
  retryLimit: number;
  version: number;
  alertIds?: string[];
}

interface PoliciesPayload {
  policies: ManagedPolicy[];
}

interface DeliveryRecord {
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

interface DeliveriesPayload {
  deliveries: DeliveryRecord[];
}

interface DispatchSchedule {
  id: string;
  name: string;
  enabled: boolean;
  profileId: string;
  windowDays: number;
  cadenceMinutes: number;
  cooldownMinutes: number;
  thresholds?: {
    warningFailureRatePct?: number;
    criticalFailureRatePct?: number;
    warningOverdueMinutes?: number;
    criticalOverdueMinutes?: number;
    warningSuccessRatePct?: number;
  };
  version: number;
  nextRunAt: string;
  lastRunAt?: string;
}

interface SchedulesPayload {
  schedules: DispatchSchedule[];
}

interface ScheduleRunPayload {
  dueCount: number;
  runCount: number;
  runs?: Array<{
    scheduleId: string;
    readinessStatus: "healthy" | "warning" | "critical";
  }>;
}

interface AuditEventRecord {
  actorId: string;
  action: string;
  entity: string;
  entityId: string;
  metadata?: Record<string, unknown>;
}

interface AuditEventsPayload {
  events: AuditEventRecord[];
}

interface SettingsSchemaFieldDescriptor {
  key: string;
  type: "string" | "number" | "integer" | "boolean" | "array" | "object" | "unknown";
  required: boolean;
  min?: number;
  max?: number;
  defaultValue?: unknown;
}

interface SettingsSchemaCatalogEntry {
  moduleId: string;
  schemaVersion: number;
  fields: SettingsSchemaFieldDescriptor[];
}

interface ModuleSettingsPayload {
  moduleId: string;
  values: Record<string, unknown>;
  version: number;
}

interface AutomationPulsePayload {
  generatedAt: string;
  readiness: IntelligencePayload["automation"]["readiness"];
  slo: IntelligencePayload["automation"]["slo"];
  deliveries: DeliveryRecord[];
  schedules: DispatchSchedule[];
}

interface ThresholdAuditEntry {
  id: string;
  at: string;
  actorId: string;
  action: string;
  version: number | null;
  changedKeys: string[];
}

function conflictMessage(payload: { currentVersion?: number } | null, entity: string): string {
  if (payload && typeof payload.currentVersion === "number") {
    return `${entity} was updated by another session. Reloaded latest version ${payload.currentVersion}.`;
  }

  return `${entity} was updated by another session. Reload and try again.`;
}

function sparklinePath(values: number[]): string {
  if (values.length === 0) {
    return "";
  }

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  return values
    .map((value, index) => {
      const x = (index / Math.max(values.length - 1, 1)) * 100;
      const y = 100 - ((value - min) / range) * 100;
      return `${index === 0 ? "M" : "L"}${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
}

export default function LiveIntelligencePanel({ profileId }: LiveIntelligencePanelProps) {
  const [data, setData] = useState<IntelligencePayload | null>(null);
  const [policies, setPolicies] = useState<ManagedPolicy[]>([]);
  const [deliveries, setDeliveries] = useState<DeliveryRecord[]>([]);
  const [schedules, setSchedules] = useState<DispatchSchedule[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [windowDays, setWindowDays] = useState<number>(7);
  const [dispatching, setDispatching] = useState(false);
  const [dispatchMessage, setDispatchMessage] = useState<string | null>(null);
  const [policyId, setPolicyId] = useState("");
  const [policyName, setPolicyName] = useState("");
  const [policyWebhookUrl, setPolicyWebhookUrl] = useState("");
  const [policySeverity, setPolicySeverity] = useState<"low" | "medium" | "high">("high");
  const [policyAlertIds, setPolicyAlertIds] = useState("");
  const [policyRetryLimit, setPolicyRetryLimit] = useState(3);
  const [policyBusy, setPolicyBusy] = useState(false);
  const [policyMessage, setPolicyMessage] = useState<string | null>(null);
  const [scheduleId, setScheduleId] = useState("");
  const [scheduleName, setScheduleName] = useState("");
  const [scheduleProfile, setScheduleProfile] = useState(profileId);
  const [scheduleWindowDays, setScheduleWindowDays] = useState(7);
  const [scheduleCadenceMinutes, setScheduleCadenceMinutes] = useState(60);
  const [scheduleCooldownMinutes, setScheduleCooldownMinutes] = useState(15);
  const [scheduleWarningFailureRatePct, setScheduleWarningFailureRatePct] = useState("");
  const [scheduleCriticalFailureRatePct, setScheduleCriticalFailureRatePct] = useState("");
  const [scheduleWarningOverdueMinutes, setScheduleWarningOverdueMinutes] = useState("");
  const [scheduleCriticalOverdueMinutes, setScheduleCriticalOverdueMinutes] = useState("");
  const [scheduleWarningSuccessRatePct, setScheduleWarningSuccessRatePct] = useState("");
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [scheduleMessage, setScheduleMessage] = useState<string | null>(null);
  const [streamConnected, setStreamConnected] = useState(false);
  const [intelligenceSchema, setIntelligenceSchema] =
    useState<SettingsSchemaCatalogEntry | null>(null);
  const [intelligenceSettings, setIntelligenceSettings] = useState<Record<string, number>>({});
  const [intelligenceSettingsVersion, setIntelligenceSettingsVersion] =
    useState<number | null>(null);
  const [intelligenceSettingsBusy, setIntelligenceSettingsBusy] = useState(false);
  const [intelligenceSettingsMessage, setIntelligenceSettingsMessage] =
    useState<string | null>(null);
  const [thresholdAuditEvents, setThresholdAuditEvents] = useState<ThresholdAuditEntry[]>([]);
  const [thresholdAuditAvailable, setThresholdAuditAvailable] = useState(true);

  const load = async (signal?: AbortSignal) => {
    const [
      intelligenceResponse,
      policiesResponse,
      deliveriesResponse,
      schedulesResponse,
      intelligenceSchemaResponse,
      intelligenceSettingsResponse,
      thresholdAuditResponse
    ] = await Promise.all([
      fetch(
        `/api/admin/intelligence?profile=${encodeURIComponent(profileId)}&windowDays=${windowDays}`,
        {
          method: "GET",
          cache: "no-store",
          signal
        }
      ),
      fetch("/api/admin/intelligence/policies", {
        method: "GET",
        cache: "no-store",
        signal
      }),
      fetch("/api/admin/intelligence/deliveries?limit=12", {
        method: "GET",
        cache: "no-store",
        signal
      }),
      fetch("/api/admin/intelligence/schedules", {
        method: "GET",
        cache: "no-store",
        signal
      }),
      fetch("/api/admin/settings/schema?moduleId=intelligence", {
        method: "GET",
        cache: "no-store",
        signal
      }),
      fetch("/api/admin/settings?moduleId=intelligence", {
        method: "GET",
        cache: "no-store",
        signal
      }),
      fetch(
        "/api/admin/audit?limit=8&entity=module-settings&entityId=intelligence&action=settings.patch",
        {
          method: "GET",
          cache: "no-store",
          signal
        }
      )
    ]);

    const isThresholdAuditReadable =
      thresholdAuditResponse.ok || thresholdAuditResponse.status === 401 || thresholdAuditResponse.status === 403;

    if (!isThresholdAuditReadable) {
      const payload = (await thresholdAuditResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${thresholdAuditResponse.status}`);
    }

    if (!thresholdAuditResponse.ok && thresholdAuditResponse.status !== 401 && thresholdAuditResponse.status !== 403) {
      const payload = (await thresholdAuditResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${thresholdAuditResponse.status}`);
    }

    const thresholdAuditPayload =
      thresholdAuditResponse.ok
        ? ((await thresholdAuditResponse.json()) as AuditEventsPayload)
        : null;

    const parsedThresholdAuditEvents: ThresholdAuditEntry[] = (thresholdAuditPayload?.events ?? [])
      .map((event, index) => {
        const changedKeysRaw = event.metadata?.changedKeys;
        const changedKeys = Array.isArray(changedKeysRaw)
          ? changedKeysRaw.filter((item): item is string => typeof item === "string")
          : [];
        const atRaw = event.metadata?.at;
        const at =
          typeof atRaw === "string" && !Number.isNaN(Date.parse(atRaw))
            ? new Date(Date.parse(atRaw)).toISOString()
            : new Date(0).toISOString();
        const versionRaw = event.metadata?.version;

        return {
          id: `${at}:${event.actorId}:${index}`,
          at,
          actorId: event.actorId,
          action: event.action,
          version: typeof versionRaw === "number" ? versionRaw : null,
          changedKeys
        };
      })
      .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

    const normalizedThresholdAuditEvents = parsedThresholdAuditEvents.filter((entry) =>
      entry.changedKeys.length > 0
        ? entry.changedKeys.some((key) => key.toLowerCase().includes("warning") || key.toLowerCase().includes("critical") || key.toLowerCase().includes("rate") || key.toLowerCase().includes("overdue"))
        : true
    );

    setThresholdAuditAvailable(thresholdAuditResponse.ok);
    setThresholdAuditEvents(normalizedThresholdAuditEvents);

    if (!intelligenceResponse.ok) {
      const payload = (await intelligenceResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${intelligenceResponse.status}`);
    }

    if (!policiesResponse.ok) {
      const payload = (await policiesResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${policiesResponse.status}`);
    }

    if (!deliveriesResponse.ok) {
      const payload = (await deliveriesResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${deliveriesResponse.status}`);
    }

    if (!schedulesResponse.ok) {
      const payload = (await schedulesResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${schedulesResponse.status}`);
    }

    if (!intelligenceSchemaResponse.ok) {
      const payload = (await intelligenceSchemaResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${intelligenceSchemaResponse.status}`);
    }

    if (!intelligenceSettingsResponse.ok) {
      const payload = (await intelligenceSettingsResponse.json().catch(() => null)) as
        | { error?: string }
        | null;
      throw new Error(payload?.error ?? `HTTP ${intelligenceSettingsResponse.status}`);
    }

    const payload = (await intelligenceResponse.json()) as IntelligencePayload;
    const policiesPayload = (await policiesResponse.json()) as PoliciesPayload;
    const deliveriesPayload = (await deliveriesResponse.json()) as DeliveriesPayload;
    const schedulesPayload = (await schedulesResponse.json()) as SchedulesPayload;
    const intelligenceSchemaPayload =
      (await intelligenceSchemaResponse.json()) as SettingsSchemaCatalogEntry;
    const intelligenceSettingsPayload =
      (await intelligenceSettingsResponse.json()) as ModuleSettingsPayload;

    setData(payload);
    setPolicies(policiesPayload.policies);
    setDeliveries(deliveriesPayload.deliveries);
    setSchedules(schedulesPayload.schedules);
    setIntelligenceSchema(intelligenceSchemaPayload);
    setIntelligenceSettingsVersion(intelligenceSettingsPayload.version);
    setIntelligenceSettings(
      Object.fromEntries(
        Object.entries(intelligenceSettingsPayload.values ?? {})
          .filter(([, value]) => typeof value === "number")
          .map(([key, value]) => [key, value as number])
      )
    );
    setError(null);
    setLoading(false);
  };

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();

    const safeLoad = async () => {
      try {
        await load(controller.signal);
      } catch (reason) {
        if (reason instanceof DOMException && reason.name === "AbortError") {
          return;
        }

        if (!cancelled) {
          setError(reason instanceof Error ? reason.message : "Unknown error");
          setLoading(false);
        }
      }
    };

    setLoading(true);
    safeLoad();

    const timer = setInterval(safeLoad, 20000);
    return () => {
      cancelled = true;
      controller.abort();
      clearInterval(timer);
    };
  }, [profileId, windowDays]);

  useEffect(() => {
    const streamUrl = `/api/admin/intelligence/stream?profile=${encodeURIComponent(profileId)}&windowDays=${windowDays}`;
    const source = new EventSource(streamUrl);

    source.addEventListener("open", () => {
      setStreamConnected(true);
    });

    source.addEventListener("pulse", (event) => {
      try {
        const payload = JSON.parse((event as MessageEvent<string>).data) as AutomationPulsePayload;
        setDeliveries(payload.deliveries);
        setSchedules(payload.schedules);
        setData((previous) => {
          if (!previous) {
            return previous;
          }

          return {
            ...previous,
            automation: {
              ...previous.automation,
              scheduleCount: payload.schedules.length,
              enabledScheduleCount: payload.schedules.filter((item) => item.enabled).length,
              readiness: payload.readiness,
              slo: payload.slo
            },
            generatedAt: payload.generatedAt
          };
        });
      } catch {
        // no-op for malformed stream payloads
      }
    });

    source.addEventListener("error", () => {
      setStreamConnected(false);
    });

    return () => {
      source.close();
      setStreamConnected(false);
    };
  }, [profileId, windowDays]);

  const refresh = async () => {
    try {
      await load();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unknown error");
    }
  };

  const createPolicy = async () => {
    const trimmedId = policyId.trim();
    const trimmedName = policyName.trim();
    const trimmedUrl = policyWebhookUrl.trim();
    if (!trimmedName || !trimmedUrl) {
      setPolicyMessage("Name and webhook URL are required.");
      return;
    }

    setPolicyBusy(true);
    setPolicyMessage(null);
    try {
      const idSeed = trimmedName.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
      const existingPolicy =
        trimmedId.length > 0
          ? policies.find((policy) => policy.id === trimmedId)
          : undefined;
      const parsedAlertIds = policyAlertIds
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const response = await fetch("/api/admin/intelligence/policies", {
        method: trimmedId.length > 0 ? "PUT" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id:
            trimmedId.length > 0
              ? trimmedId
              : idSeed.length > 0
                ? idSeed
                : `policy-${Date.now()}`,
          name: trimmedName,
          webhookUrl: trimmedUrl,
          enabled: existingPolicy ? existingPolicy.enabled : true,
          severities: [policySeverity],
          retryLimit: policyRetryLimit,
          expectedVersion:
            trimmedId.length > 0
              ? existingPolicy?.version ?? 0
              : undefined,
          alertIds: parsedAlertIds.length > 0 ? parsedAlertIds : undefined
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          throw new Error(conflictMessage(payload as { currentVersion?: number } | null, "Policy"));
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setPolicyId("");
      setPolicyName("");
      setPolicyWebhookUrl("");
      setPolicySeverity("high");
      setPolicyAlertIds("");
      setPolicyRetryLimit(3);
      setPolicyMessage("Policy saved.");
      await refresh();
    } catch (reason) {
      setPolicyMessage(reason instanceof Error ? reason.message : "Failed to save policy.");
    } finally {
      setPolicyBusy(false);
    }
  };

  const editPolicy = (policy: ManagedPolicy) => {
    setPolicyId(policy.id);
    setPolicyName(policy.name);
    setPolicyWebhookUrl(policy.webhookUrl);
    setPolicySeverity(policy.severities[0] ?? "high");
    setPolicyAlertIds(policy.alertIds?.join(",") ?? "");
    setPolicyRetryLimit(policy.retryLimit);
    setPolicyMessage(`Editing ${policy.id}`);
  };

  const togglePolicy = async (policy: ManagedPolicy) => {
    setPolicyBusy(true);
    setPolicyMessage(null);

    try {
      const response = await fetch("/api/admin/intelligence/policies", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...policy,
          expectedVersion: policy.version,
          enabled: !policy.enabled
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          throw new Error(conflictMessage(payload as { currentVersion?: number } | null, "Policy"));
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setPolicyMessage(`${policy.id} ${policy.enabled ? "disabled" : "enabled"}.`);
      await refresh();
    } catch (reason) {
      setPolicyMessage(reason instanceof Error ? reason.message : "Failed to toggle policy.");
    } finally {
      setPolicyBusy(false);
    }
  };

  const editSchedule = (schedule: DispatchSchedule) => {
    setScheduleId(schedule.id);
    setScheduleName(schedule.name);
    setScheduleProfile(schedule.profileId);
    setScheduleWindowDays(schedule.windowDays);
    setScheduleCadenceMinutes(schedule.cadenceMinutes);
    setScheduleCooldownMinutes(schedule.cooldownMinutes);
    setScheduleWarningFailureRatePct(
      typeof schedule.thresholds?.warningFailureRatePct === "number"
        ? String(schedule.thresholds.warningFailureRatePct)
        : ""
    );
    setScheduleCriticalFailureRatePct(
      typeof schedule.thresholds?.criticalFailureRatePct === "number"
        ? String(schedule.thresholds.criticalFailureRatePct)
        : ""
    );
    setScheduleWarningOverdueMinutes(
      typeof schedule.thresholds?.warningOverdueMinutes === "number"
        ? String(schedule.thresholds.warningOverdueMinutes)
        : ""
    );
    setScheduleCriticalOverdueMinutes(
      typeof schedule.thresholds?.criticalOverdueMinutes === "number"
        ? String(schedule.thresholds.criticalOverdueMinutes)
        : ""
    );
    setScheduleWarningSuccessRatePct(
      typeof schedule.thresholds?.warningSuccessRatePct === "number"
        ? String(schedule.thresholds.warningSuccessRatePct)
        : ""
    );
    setScheduleMessage(`Editing ${schedule.id}`);
  };

  const handleScheduleConflict = async (
    payload: { currentVersion?: number } | null
  ) => {
    setScheduleMessage(
      `${conflictMessage(payload, "Schedule")} Latest values were reloaded. Review custom thresholds and retry.`
    );
    await refresh();
  };

  const saveSchedule = async () => {
    const trimmedName = scheduleName.trim();
    if (!trimmedName) {
      setScheduleMessage("Schedule name is required.");
      return;
    }

    setScheduleBusy(true);
    setScheduleMessage(null);
    try {
      const normalizeOptionalNumber = (
        raw: string,
        bounds: { min: number; max: number }
      ): number | undefined => {
        if (raw.trim().length === 0) {
          return undefined;
        }

        const parsed = Number.parseFloat(raw);
        if (!Number.isFinite(parsed)) {
          return undefined;
        }

        return Math.max(bounds.min, Math.min(parsed, bounds.max));
      };

      const thresholdOverrides = {
        warningFailureRatePct: normalizeOptionalNumber(scheduleWarningFailureRatePct, {
          min: 0,
          max: 100
        }),
        criticalFailureRatePct: normalizeOptionalNumber(scheduleCriticalFailureRatePct, {
          min: 0,
          max: 100
        }),
        warningOverdueMinutes: normalizeOptionalNumber(scheduleWarningOverdueMinutes, {
          min: 0,
          max: 1440
        }),
        criticalOverdueMinutes: normalizeOptionalNumber(scheduleCriticalOverdueMinutes, {
          min: 0,
          max: 1440
        }),
        warningSuccessRatePct: normalizeOptionalNumber(scheduleWarningSuccessRatePct, {
          min: 0,
          max: 100
        })
      };

      const hasThresholdOverrides = Object.values(thresholdOverrides).some(
        (value) => typeof value === "number"
      );

      const trimmedScheduleId = scheduleId.trim();
      const existingSchedule =
        trimmedScheduleId.length > 0
          ? schedules.find((schedule) => schedule.id === trimmedScheduleId)
          : undefined;
      const response = await fetch("/api/admin/intelligence/schedules", {
        method: trimmedScheduleId.length > 0 ? "PUT" : "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          id: trimmedScheduleId.length > 0 ? trimmedScheduleId : undefined,
          name: trimmedName,
          profileId: scheduleProfile.trim().length > 0 ? scheduleProfile.trim() : profileId,
          windowDays: scheduleWindowDays,
          cadenceMinutes: scheduleCadenceMinutes,
          cooldownMinutes: scheduleCooldownMinutes,
          thresholds: hasThresholdOverrides ? thresholdOverrides : undefined,
          expectedVersion:
            trimmedScheduleId.length > 0
              ? existingSchedule?.version ?? 0
              : undefined,
          enabled: existingSchedule ? existingSchedule.enabled : true
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          await handleScheduleConflict(payload as { currentVersion?: number } | null);
          return;
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setScheduleId("");
      setScheduleName("");
      setScheduleProfile(profileId);
      setScheduleWindowDays(7);
      setScheduleCadenceMinutes(60);
      setScheduleCooldownMinutes(15);
      setScheduleWarningFailureRatePct("");
      setScheduleCriticalFailureRatePct("");
      setScheduleWarningOverdueMinutes("");
      setScheduleCriticalOverdueMinutes("");
      setScheduleWarningSuccessRatePct("");
      setScheduleMessage("Schedule saved.");
      await refresh();
    } catch (reason) {
      setScheduleMessage(reason instanceof Error ? reason.message : "Failed to save schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const deleteSchedule = async (schedule: DispatchSchedule) => {
    setScheduleBusy(true);
    setScheduleMessage(null);
    try {
      const response = await fetch("/api/admin/intelligence/schedules", {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          scheduleId: schedule.id,
          expectedVersion: schedule.version
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          await handleScheduleConflict(payload as { currentVersion?: number } | null);
          return;
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setScheduleMessage(`Schedule ${schedule.id} removed.`);
      await refresh();
    } catch (reason) {
      setScheduleMessage(reason instanceof Error ? reason.message : "Failed to delete schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const toggleSchedule = async (schedule: DispatchSchedule) => {
    setScheduleBusy(true);
    setScheduleMessage(null);
    try {
      const response = await fetch("/api/admin/intelligence/schedules", {
        method: "PUT",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          ...schedule,
          expectedVersion: schedule.version,
          enabled: !schedule.enabled
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          await handleScheduleConflict(payload as { currentVersion?: number } | null);
          return;
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setScheduleMessage(`${schedule.id} ${schedule.enabled ? "disabled" : "enabled"}.`);
      await refresh();
    } catch (reason) {
      setScheduleMessage(reason instanceof Error ? reason.message : "Failed to toggle schedule.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const runDueSchedules = async () => {
    setScheduleBusy(true);
    setScheduleMessage(null);
    try {
      const response = await fetch("/api/admin/intelligence/schedules/run", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({ limit: 10 })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      const payload = (await response.json()) as ScheduleRunPayload;
      const runs = Array.isArray(payload.runs) ? payload.runs : [];
      const healthyRuns = runs.filter((run) => run.readinessStatus === "healthy").length;
      const warningRuns = runs.filter((run) => run.readinessStatus === "warning").length;
      const criticalRuns = runs.filter((run) => run.readinessStatus === "critical").length;

      const readinessSummary =
        runs.length > 0
          ? ` readiness: ${healthyRuns} healthy, ${warningRuns} warning, ${criticalRuns} critical.`
          : "";

      setScheduleMessage(
        `Schedules due: ${payload.dueCount}, executed: ${payload.runCount}.${readinessSummary}`
      );
      await refresh();
    } catch (reason) {
      setScheduleMessage(reason instanceof Error ? reason.message : "Failed to run schedules.");
    } finally {
      setScheduleBusy(false);
    }
  };

  const saveIntelligenceThresholds = async () => {
    setIntelligenceSettingsBusy(true);
    setIntelligenceSettingsMessage(null);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "PATCH",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          moduleId: "intelligence",
          values: intelligenceSettings,
          expectedVersion: intelligenceSettingsVersion ?? undefined
        })
      });

      const payload = (await response.json().catch(() => null)) as
        | { error?: string; currentVersion?: number; version?: number; values?: Record<string, unknown> }
        | null;

      if (!response.ok) {
        if (response.status === 409) {
          throw new Error(
            conflictMessage(
              payload as { currentVersion?: number } | null,
              "Intelligence thresholds"
            )
          );
        }

        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setIntelligenceSettingsVersion(
        payload && typeof payload.version === "number" ? payload.version : intelligenceSettingsVersion
      );
      setIntelligenceSettingsMessage("Intelligence thresholds saved.");
      await refresh();
    } catch (reason) {
      setIntelligenceSettingsMessage(
        reason instanceof Error ? reason.message : "Failed to save intelligence thresholds."
      );
    } finally {
      setIntelligenceSettingsBusy(false);
    }
  };

  const removePolicy = async (policy: ManagedPolicy) => {
    setPolicyBusy(true);
    setPolicyMessage(null);
    try {
      const response = await fetch("/api/admin/intelligence/policies", {
        method: "DELETE",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          policyId: policy.id,
          expectedVersion: policy.version
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        if (response.status === 409) {
          throw new Error(conflictMessage(payload as { currentVersion?: number } | null, "Policy"));
        }
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      setPolicyMessage(`Policy ${policy.id} removed.`);
      await refresh();
    } catch (reason) {
      setPolicyMessage(reason instanceof Error ? reason.message : "Failed to remove policy.");
    } finally {
      setPolicyBusy(false);
    }
  };

  const runDispatch = async () => {
    setDispatching(true);
    setDispatchMessage(null);

    try {
      const response = await fetch("/api/admin/intelligence/dispatch", {
        method: "POST",
        headers: {
          "content-type": "application/json"
        },
        body: JSON.stringify({
          profile: profileId,
          windowDays
        })
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? `HTTP ${response.status}`);
      }

      const payload = (await response.json()) as DispatchPayload;
      const delivered = payload.deliveries.filter((item) => item.status === "delivered").length;
      const failed = payload.deliveries.filter((item) => item.status === "failed").length;
      const skipped = payload.deliveries.filter((item) => item.status === "skipped").length;

      setDispatchMessage(
        `Dispatch ${payload.windowToken}: ${delivered} delivered, ${failed} failed, ${skipped} skipped.`
      );
      await refresh();
    } catch (reason) {
      setDispatchMessage(
        reason instanceof Error ? reason.message : "Failed to run intelligence dispatch."
      );
    } finally {
      setDispatching(false);
    }
  };

  const categoryRows = useMemo(() => {
    if (!data) {
      return [];
    }

    const total = Object.values(data.runtime.modulesByCategory).reduce(
      (sum, value) => sum + value,
      0
    );

    return Object.entries(data.runtime.modulesByCategory)
      .map(([name, count]) => ({
        name,
        count,
        share: total > 0 ? (count / total) * 100 : 0
      }))
      .sort((a, b) => b.count - a.count);
  }, [data]);

  if (loading) {
    return (
      <section className="panel-card live-panel">
        <h3>Live Intelligence Stream</h3>
        <p className="subtle-copy">Loading real-time platform intelligence...</p>
      </section>
    );
  }

  if (error || !data) {
    return (
      <section className="panel-card live-panel">
        <h3>Live Intelligence Stream</h3>
        <p className="status-off">Failed to load: {error ?? "Unknown error"}</p>
      </section>
    );
  }

  return (
    <section className="panel-card live-panel">
      <div className="live-header">
        <h3>Live Intelligence Stream</h3>
        <div className="live-controls">
          <label htmlFor="windowDays">Window</label>
          <select
            id="windowDays"
            value={windowDays}
            onChange={(event) => setWindowDays(Number(event.target.value))}
          >
            <option value={7}>7d</option>
            <option value={14}>14d</option>
            <option value={30}>30d</option>
          </select>
          <span className={streamConnected ? "status-on" : "status-off"}>
            {streamConnected ? "stream live" : "stream reconnecting"}
          </span>
          <span className="chip">{new Date(data.generatedAt).toLocaleTimeString()}</span>
        </div>
      </div>

      <div className="live-kpi-grid">
        <article>
          <span>Health</span>
          <strong>{data.kpis.healthScore.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Reliability</span>
          <strong>{data.kpis.reliabilityScore.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Velocity</span>
          <strong>{data.kpis.velocityScore.toFixed(1)}%</strong>
        </article>
        <article>
          <span>Security</span>
          <strong>{data.kpis.securityScore.toFixed(1)}%</strong>
        </article>
      </div>

      <div className="grid-two compact-grid">
        <article>
          <h4>Category Mix</h4>
          <ul className="bar-list compact-list">
            {categoryRows.map((row) => (
              <li key={row.name}>
                <div className="bar-head">
                  <span>{row.name}</span>
                  <span>
                    {row.count} ({row.share.toFixed(1)}%)
                  </span>
                </div>
                <div className="bar-track">
                  <span style={{ width: `${row.share}%` }} />
                </div>
              </li>
            ))}
          </ul>
        </article>

        <article>
          <h4>Audit Pulse</h4>
          {data.audit.available && data.audit.summary ? (
            <ul className="bullet-list">
              <li>Last {data.insights.windowDays}d events: {data.audit.summary.total}</li>
              <li>Denied actions: {data.audit.summary.byAction["authz.denied"] ?? 0}</li>
              <li>
                Top actor volume: {Math.max(...Object.values(data.audit.summary.byActor), 0)}
              </li>
            </ul>
          ) : (
            <p className="subtle-copy">Audit summary unavailable for this role.</p>
          )}
        </article>
      </div>

      <div className="trend-grid">
        <article>
          <h4>Window Throughput</h4>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="throughput trend">
            <path d={sparklinePath(data.trendSeries.weeklyThroughput)} />
          </svg>
        </article>
        <article>
          <h4>Reliability Trend</h4>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="reliability trend">
            <path d={sparklinePath(data.trendSeries.reliability)} />
          </svg>
        </article>
        <article>
          <h4>Risk Load Trend</h4>
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-label="risk trend">
            <path d={sparklinePath(data.trendSeries.riskLoad)} />
          </svg>
        </article>
      </div>

      <div className="grid-two compact-grid">
        <article>
          <h4>Window Comparison</h4>
          <ul className="bullet-list">
            <li>
              Throughput delta: {data.insights.comparison.throughputDeltaPct.toFixed(1)}%
            </li>
            <li>
              Reliability delta: {data.insights.comparison.reliabilityDelta.toFixed(1)} pts
            </li>
            <li>Risk delta: {data.insights.comparison.riskDeltaPct.toFixed(1)}%</li>
          </ul>
        </article>

        <article>
          <h4>Active Alerts</h4>
          {data.insights.alerts.length > 0 ? (
            <ul className="alert-list">
              {data.insights.alerts.map((alert) => (
                <li key={alert.id} className={`alert-${alert.severity}`}>
                  <strong>{alert.title}</strong>
                  <span>{alert.detail}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle-copy">No active alerts in this window.</p>
          )}
        </article>
      </div>

      <article className="panel-card recommendation-panel">
        <h4>Recommended Actions</h4>
        {data.insights.recommendations.length > 0 ? (
          <ul className="recommendation-list">
            {data.insights.recommendations.map((rec) => (
              <li key={rec.id}>
                <div>
                  <span className="chip">{rec.priority.toUpperCase()}</span>
                  <strong>{rec.title}</strong>
                </div>
                <p>{rec.detail}</p>
                <a href={rec.endpoint} className="text-link">
                  Open Endpoint
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="subtle-copy">No recommendations for this window.</p>
        )}
      </article>

      <div className="grid-two compact-grid">
        <article>
          <div className="automation-header">
            <h4>Automation Policies</h4>
            <span className="chip">
              {policies.filter((policy) => policy.enabled).length}/{policies.length} enabled
            </span>
          </div>

          <div className="metric-matrix">
            <div>
              <span>Automation status</span>
              <strong>{data.automation.readiness.status}</strong>
            </div>
            <div>
              <span>Delivery success</span>
              <strong>{data.automation.readiness.delivery.successRatePct.toFixed(1)}%</strong>
            </div>
            <div>
              <span>Schedules</span>
              <strong>
                {data.automation.enabledScheduleCount}/{data.automation.scheduleCount}
              </strong>
            </div>
            <div>
              <span>Overdue schedules</span>
              <strong>{data.automation.readiness.schedules.overdue}</strong>
            </div>
            <div>
              <span>Release gate</span>
              <strong className={data.automation.slo.releaseReady ? "status-on" : "status-off"}>
                {data.automation.slo.releaseReady ? "ready" : "blocked"}
              </strong>
            </div>
          </div>

          <div className="slo-check-grid">
            {data.automation.slo.checks.map((check) => (
              <article key={check.id} className="slo-check-item">
                <div>
                  <strong>{check.label}</strong>
                  <span className={check.status === "pass" ? "status-on" : "status-off"}>
                    {check.status}
                  </span>
                </div>
                <p>
                  {check.value === null ? "n/a" : check.value}
                  {check.unit === "count" ? "" : ` ${check.unit}`} {check.comparator} {check.target}
                  {check.unit === "count" ? "" : ` ${check.unit}`}
                </p>
                <p>{check.detail}</p>
              </article>
            ))}
          </div>

          {policies.length > 0 ? (
            <ul className="automation-list">
              {policies.map((policy) => (
                <li key={policy.id}>
                  <div>
                    <strong>{policy.name}</strong>
                    <span className={policy.enabled ? "status-on" : "status-off"}>
                      {policy.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  <p>
                    id: {policy.id} | severity: {policy.severities.join(", ")} | retry: {policy.retryLimit}
                  </p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="inline-action"
                      disabled={policyBusy}
                      onClick={() => editPolicy(policy)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-action"
                      disabled={policyBusy}
                      onClick={() => togglePolicy(policy)}
                    >
                      {policy.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="inline-action"
                      disabled={policyBusy}
                      onClick={() => removePolicy(policy)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle-copy">No automation policies configured.</p>
          )}
        </article>

        <article>
          <h4>{policyId ? `Edit Policy ${policyId}` : "Create Policy"}</h4>
          <div className="policy-form">
            <label>
              Policy id
              <input
                type="text"
                value={policyId}
                onChange={(event) => setPolicyId(event.target.value)}
                placeholder="ops-high-risk"
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={policyName}
                onChange={(event) => setPolicyName(event.target.value)}
                placeholder="Ops high-risk webhook"
              />
            </label>
            <label>
              Webhook URL
              <input
                type="url"
                value={policyWebhookUrl}
                onChange={(event) => setPolicyWebhookUrl(event.target.value)}
                placeholder="https://example.com/hooks/admin"
              />
            </label>
            <label>
              Alert ids (comma-separated)
              <input
                type="text"
                value={policyAlertIds}
                onChange={(event) => setPolicyAlertIds(event.target.value)}
                placeholder="risk-escalation,authorization-pressure"
              />
            </label>
            <div className="policy-inline-fields">
              <label>
                Severity
                <select
                  value={policySeverity}
                  onChange={(event) =>
                    setPolicySeverity(event.target.value as "low" | "medium" | "high")
                  }
                >
                  <option value="high">high</option>
                  <option value="medium">medium</option>
                  <option value="low">low</option>
                </select>
              </label>
              <label>
                Retry limit
                <input
                  type="number"
                  min={1}
                  max={5}
                  value={policyRetryLimit}
                  onChange={(event) =>
                    setPolicyRetryLimit(
                      Math.max(1, Math.min(Number.parseInt(event.target.value || "3", 10), 5))
                    )
                  }
                />
              </label>
            </div>

            <div className="inline-actions">
              <button type="button" className="action-button" disabled={policyBusy} onClick={createPolicy}>
                {policyBusy ? "Saving..." : policyId ? "Update Policy" : "Save Policy"}
              </button>
              <button
                type="button"
                className="action-button secondary"
                disabled={policyBusy}
                onClick={() => {
                  setPolicyId("");
                  setPolicyName("");
                  setPolicyWebhookUrl("");
                  setPolicySeverity("high");
                  setPolicyAlertIds("");
                  setPolicyRetryLimit(3);
                  setPolicyMessage(null);
                }}
              >
                Clear
              </button>
              <button type="button" className="action-button secondary" disabled={dispatching} onClick={runDispatch}>
                {dispatching ? "Dispatching..." : "Dispatch Alerts Now"}
              </button>
            </div>

            {policyMessage ? <p className="subtle-copy">{policyMessage}</p> : null}
            {dispatchMessage ? <p className="subtle-copy">{dispatchMessage}</p> : null}
          </div>
        </article>
      </div>

      <article className="panel-card">
        <div className="automation-header">
          <h4>Automation SLO Thresholds</h4>
          <span className="chip">schema-driven</span>
        </div>

        {intelligenceSchema ? (
          <div className="policy-form">
            <div className="policy-inline-fields">
              {intelligenceSchema.fields
                .filter((field) => field.type === "number" || field.type === "integer")
                .map((field) => (
                  <label key={field.key}>
                    {field.key}
                    <input
                      type="number"
                      min={typeof field.min === "number" ? field.min : undefined}
                      max={typeof field.max === "number" ? field.max : undefined}
                      step={field.type === "integer" ? 1 : "any"}
                      value={
                        typeof intelligenceSettings[field.key] === "number"
                          ? intelligenceSettings[field.key]
                          : typeof field.defaultValue === "number"
                            ? field.defaultValue
                            : ""
                      }
                      onChange={(event) => {
                        const raw = event.target.value;
                        const parsed =
                          raw.trim().length === 0
                            ? Number.NaN
                            : Number.parseFloat(raw);

                        setIntelligenceSettings((previous) => ({
                          ...previous,
                          [field.key]: Number.isNaN(parsed) ? 0 : parsed
                        }));
                      }}
                    />
                  </label>
                ))}
            </div>

            <div className="inline-actions">
              <button
                type="button"
                className="action-button"
                disabled={intelligenceSettingsBusy}
                onClick={saveIntelligenceThresholds}
              >
                {intelligenceSettingsBusy ? "Saving..." : "Save Thresholds"}
              </button>
            </div>

            {intelligenceSettingsMessage ? (
              <p className="subtle-copy">{intelligenceSettingsMessage}</p>
            ) : null}

            <div className="threshold-audit">
              <h5>Recent Threshold Changes</h5>
              {thresholdAuditAvailable ? (
                thresholdAuditEvents.length > 0 ? (
                  <ul className="threshold-audit-list">
                    {thresholdAuditEvents.map((event) => (
                      <li key={event.id}>
                        <div>
                          <strong>{event.actorId}</strong>
                          <span>{new Date(event.at).toLocaleString()}</span>
                        </div>
                        <p>
                          {event.changedKeys.length > 0
                            ? `Changed: ${event.changedKeys.join(", ")}`
                            : "Changed module intelligence settings."}
                        </p>
                        {typeof event.version === "number" ? (
                          <span className="chip">v{event.version}</span>
                        ) : null}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="subtle-copy">No threshold changes recorded yet.</p>
                )
              ) : (
                <p className="subtle-copy">Audit history unavailable for this role.</p>
              )}
            </div>
          </div>
        ) : (
          <p className="subtle-copy">Threshold schema unavailable.</p>
        )}
      </article>

      <article className="panel-card">
        <h4>Recent Delivery History</h4>
        {deliveries.length > 0 ? (
          <div className="risk-matrix-wrap">
            <table className="risk-matrix">
              <thead>
                <tr>
                  <th>Time</th>
                  <th>Policy</th>
                  <th>Window</th>
                  <th>Alert</th>
                  <th>Status</th>
                  <th>Attempts</th>
                </tr>
              </thead>
              <tbody>
                {deliveries.map((delivery) => (
                  <tr key={delivery.idempotencyKey}>
                    <td>{new Date(delivery.at).toLocaleString()}</td>
                    <td>{delivery.policyId}</td>
                    <td>{delivery.windowToken}</td>
                    <td>{delivery.alertId}</td>
                    <td>{delivery.status}</td>
                    <td>
                      {delivery.attempts}
                      {delivery.error ? ` (${delivery.error})` : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="subtle-copy">No delivery history available yet.</p>
        )}
      </article>

      <div className="grid-two compact-grid">
        <article>
          <div className="automation-header">
            <h4>Dispatch Schedules</h4>
            <button
              type="button"
              className="inline-action"
              disabled={scheduleBusy}
              onClick={runDueSchedules}
            >
              Run Due Now
            </button>
          </div>

          {schedules.length > 0 ? (
            <ul className="automation-list">
              {schedules.map((schedule) => (
                <li key={schedule.id}>
                  <div>
                    <strong>{schedule.name}</strong>
                    <span className={schedule.enabled ? "status-on" : "status-off"}>
                      {schedule.enabled ? "enabled" : "disabled"}
                    </span>
                  </div>
                  <p>
                    {schedule.profileId} | every {schedule.cadenceMinutes}m | cooldown {schedule.cooldownMinutes}m
                  </p>
                  {schedule.thresholds ? (
                    <p>
                      custom thresholds: wf {schedule.thresholds.warningFailureRatePct ?? "-"}% / cf {schedule.thresholds.criticalFailureRatePct ?? "-"}% / wo {schedule.thresholds.warningOverdueMinutes ?? "-"}m / co {schedule.thresholds.criticalOverdueMinutes ?? "-"}m / ws {schedule.thresholds.warningSuccessRatePct ?? "-"}%
                    </p>
                  ) : null}
                  <p>
                    next: {new Date(schedule.nextRunAt).toLocaleString()}
                    {schedule.lastRunAt ? ` | last: ${new Date(schedule.lastRunAt).toLocaleString()}` : ""}
                  </p>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="inline-action"
                      disabled={scheduleBusy}
                      onClick={() => editSchedule(schedule)}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="inline-action"
                      disabled={scheduleBusy}
                      onClick={() => toggleSchedule(schedule)}
                    >
                      {schedule.enabled ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="inline-action"
                      disabled={scheduleBusy}
                      onClick={() => deleteSchedule(schedule)}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="subtle-copy">No schedules configured.</p>
          )}
        </article>

        <article>
          <h4>{scheduleId ? `Edit Schedule ${scheduleId}` : "Create Schedule"}</h4>
          <div className="policy-form">
            <label>
              Schedule id
              <input
                type="text"
                value={scheduleId}
                onChange={(event) => setScheduleId(event.target.value)}
                placeholder="daily-commerce-scan"
              />
            </label>
            <label>
              Name
              <input
                type="text"
                value={scheduleName}
                onChange={(event) => setScheduleName(event.target.value)}
                placeholder="Commerce hourly intelligence"
              />
            </label>
            <label>
              Profile
              <input
                type="text"
                value={scheduleProfile}
                onChange={(event) => setScheduleProfile(event.target.value)}
                placeholder="commerce"
              />
            </label>
            <div className="policy-inline-fields">
              <label>
                Window days
                <input
                  type="number"
                  min={3}
                  max={30}
                  value={scheduleWindowDays}
                  onChange={(event) =>
                    setScheduleWindowDays(
                      Math.max(3, Math.min(Number.parseInt(event.target.value || "7", 10), 30))
                    )
                  }
                />
              </label>
              <label>
                Cadence minutes
                <input
                  type="number"
                  min={5}
                  max={1440}
                  value={scheduleCadenceMinutes}
                  onChange={(event) =>
                    setScheduleCadenceMinutes(
                      Math.max(5, Math.min(Number.parseInt(event.target.value || "60", 10), 1440))
                    )
                  }
                />
              </label>
            </div>
            <label>
              Cooldown minutes
              <input
                type="number"
                min={0}
                max={1440}
                value={scheduleCooldownMinutes}
                onChange={(event) =>
                  setScheduleCooldownMinutes(
                    Math.max(0, Math.min(Number.parseInt(event.target.value || "15", 10), 1440))
                  )
                }
              />
            </label>

            <div className="policy-inline-fields">
              <label>
                Warn fail rate %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scheduleWarningFailureRatePct}
                  onChange={(event) => setScheduleWarningFailureRatePct(event.target.value)}
                  placeholder="inherit"
                />
              </label>
              <label>
                Critical fail rate %
                <input
                  type="number"
                  min={0}
                  max={100}
                  value={scheduleCriticalFailureRatePct}
                  onChange={(event) => setScheduleCriticalFailureRatePct(event.target.value)}
                  placeholder="inherit"
                />
              </label>
            </div>

            <div className="policy-inline-fields">
              <label>
                Warn overdue minutes
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={scheduleWarningOverdueMinutes}
                  onChange={(event) => setScheduleWarningOverdueMinutes(event.target.value)}
                  placeholder="inherit"
                />
              </label>
              <label>
                Critical overdue minutes
                <input
                  type="number"
                  min={0}
                  max={1440}
                  value={scheduleCriticalOverdueMinutes}
                  onChange={(event) => setScheduleCriticalOverdueMinutes(event.target.value)}
                  placeholder="inherit"
                />
              </label>
            </div>

            <label>
              Warn success rate %
              <input
                type="number"
                min={0}
                max={100}
                value={scheduleWarningSuccessRatePct}
                onChange={(event) => setScheduleWarningSuccessRatePct(event.target.value)}
                placeholder="inherit"
              />
            </label>

            <div className="inline-actions">
              <button
                type="button"
                className="action-button"
                disabled={scheduleBusy}
                onClick={saveSchedule}
              >
                {scheduleBusy ? "Saving..." : scheduleId ? "Update Schedule" : "Save Schedule"}
              </button>
              <button
                type="button"
                className="action-button secondary"
                disabled={scheduleBusy}
                onClick={() => {
                  setScheduleId("");
                  setScheduleName("");
                  setScheduleProfile(profileId);
                  setScheduleWindowDays(7);
                  setScheduleCadenceMinutes(60);
                  setScheduleCooldownMinutes(15);
                  setScheduleWarningFailureRatePct("");
                  setScheduleCriticalFailureRatePct("");
                  setScheduleWarningOverdueMinutes("");
                  setScheduleCriticalOverdueMinutes("");
                  setScheduleWarningSuccessRatePct("");
                  setScheduleMessage(null);
                }}
              >
                Clear
              </button>
            </div>

            {scheduleMessage ? <p className="subtle-copy">{scheduleMessage}</p> : null}
          </div>
        </article>
      </div>

      {data.audit.available ? (
        <div className="grid-two compact-grid">
          <article>
            <h4>Top Actions</h4>
            <ul className="bullet-list">
              {data.insights.topActions.length > 0 ? (
                data.insights.topActions.map((item) => (
                  <li key={item.action}>
                    {item.action}: {item.count}
                  </li>
                ))
              ) : (
                <li>No actions in the current window.</li>
              )}
            </ul>
          </article>

          <article>
            <h4>Top Entities</h4>
            <ul className="bullet-list">
              {data.insights.topEntities.length > 0 ? (
                data.insights.topEntities.map((item) => (
                  <li key={item.entity}>
                    {item.entity}: {item.count}
                  </li>
                ))
              ) : (
                <li>No entities in the current window.</li>
              )}
            </ul>
          </article>
        </div>
      ) : null}

      {data.audit.available ? (
        <div className="grid-two compact-grid">
          <article>
            <h4>Top Actors</h4>
            <ul className="bullet-list">
              {data.insights.topActors.length > 0 ? (
                data.insights.topActors.map((item) => (
                  <li key={item.actorId}>
                    {item.actorId}: {item.count}
                  </li>
                ))
              ) : (
                <li>No actor activity in the current window.</li>
              )}
            </ul>
          </article>

          <article>
            <h4>Daily Risk Matrix</h4>
            <div className="risk-matrix-wrap">
              <table className="risk-matrix">
                <thead>
                  <tr>
                    <th>Day</th>
                    <th>Total</th>
                    <th>Denied</th>
                    <th>Incidents</th>
                    <th>Reliability</th>
                    <th>Risk</th>
                  </tr>
                </thead>
                <tbody>
                  {data.insights.dailyBreakdown.map((day) => (
                    <tr key={day.day}>
                      <td>{day.day}</td>
                      <td>{day.total}</td>
                      <td>{day.denied}</td>
                      <td>{day.incidents}</td>
                      <td>{day.reliability.toFixed(1)}%</td>
                      <td>{day.riskLoad}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </div>
      ) : null}
    </section>
  );
}
