import { afterEach, describe, expect, it, vi } from "vitest";
import {
  deleteIntelligenceAlertPolicy,
  deleteIntelligenceDispatchSchedule,
  dispatchIntelligenceAlerts,
  getModuleSettings,
  listAuditEvents,
  listIntelligenceAlertDeliveries,
  listIntelligenceAlertPolicies,
  listIntelligenceDispatchSchedules,
  listDueIntelligenceDispatchSchedules,
  markIntelligenceDispatchScheduleRun,
  patchModuleSettings,
  recordAdminAuditEvent,
  upsertIntelligenceDispatchSchedule,
  upsertIntelligenceAlertPolicy,
  updateModuleSettings
} from "../runtime";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("audit runtime helpers", () => {
  it("preserves caller-provided metadata.at timestamps", async () => {
    const action = `test.audit.custom-at.${Date.now()}`;
    const providedAt = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "custom-at-case",
      metadata: {
        at: providedAt,
        marker: "custom-at"
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      limit: 1
    });

    expect(events.length).toBe(1);
    expect(events[0].metadata?.at).toBe(providedAt);
  });

  it("records audit events with timestamp metadata", async () => {
    const action = `test.audit.timestamp.${Date.now()}`;

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "timestamp-case",
      metadata: {
        marker: "timestamp"
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      limit: 1
    });

    expect(events.length).toBe(1);
    expect(typeof events[0].metadata?.at).toBe("string");
  });

  it("redacts sensitive fields in audit responses", async () => {
    const action = `test.audit.redaction.${Date.now()}`;

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "redaction-case",
      metadata: {
        safe: "keep-me",
        password: "super-secret",
        nested: {
          token: "abc123"
        }
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      limit: 1
    });

    expect(events.length).toBe(1);
    expect(events[0].metadata?.safe).toBe("keep-me");
    expect(events[0].metadata?.password).toBe("[REDACTED]");

    const nested = events[0].metadata?.nested as Record<string, unknown> | undefined;
    expect(nested?.token).toBe("[REDACTED]");
  });

  it("normalizes metadata.timestamp into metadata.at", async () => {
    const action = `test.audit.timestamp-normalize.${Date.now()}`;
    const stampedAt = new Date().toISOString();

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "timestamp-normalize-case",
      metadata: {
        timestamp: stampedAt,
        marker: "timestamp-normalize"
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      limit: 1
    });

    expect(events.length).toBe(1);
    const normalizedAt = events[0].metadata?.at;
    expect(typeof normalizedAt).toBe("string");

    const expectedMs = Date.parse(stampedAt);
    const actualMs = Date.parse(normalizedAt as string);
    expect(Number.isNaN(actualMs)).toBe(false);
    expect(Math.abs(actualMs - expectedMs)).toBeLessThanOrEqual(1000);
  });

  it("filters out events older than retention window", async () => {
    const action = `test.audit.retention.${Date.now()}`;
    const oldAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000).toISOString();

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "retention-case",
      metadata: {
        at: oldAt,
        marker: "retention-old"
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      limit: 10
    });

    expect(events).toHaveLength(0);
  });

  it("isolates settings values across tenants", async () => {
    await updateModuleSettings(
      "inventory",
      {
        enabled: false,
        refreshIntervalSeconds: 120
      },
      { tenantId: "tenant-alpha" }
    );

    await updateModuleSettings(
      "inventory",
      {
        enabled: true,
        refreshIntervalSeconds: 30
      },
      { tenantId: "tenant-beta" }
    );

    const alphaValues = (await getModuleSettings("inventory", { tenantId: "tenant-alpha" }))
      ?.values as Record<string, unknown>;
    const betaValues = (await getModuleSettings("inventory", { tenantId: "tenant-beta" }))
      ?.values as Record<string, unknown>;

    expect(alphaValues.enabled).toBe(false);
    expect(alphaValues.refreshIntervalSeconds).toBe(120);
    expect(betaValues.enabled).toBe(true);
    expect(betaValues.refreshIntervalSeconds).toBe(30);
  });

  it("filters audit events by tenant scope", async () => {
    const action = `test.audit.tenant-scope.${Date.now()}`;

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "tenant-alpha-case",
      tenantId: "tenant-alpha",
      metadata: {
        marker: "tenant-alpha"
      }
    });

    await recordAdminAuditEvent({
      action,
      entity: "audit-runtime-test",
      entityId: "tenant-beta-case",
      tenantId: "tenant-beta",
      metadata: {
        marker: "tenant-beta"
      }
    });

    const alphaEvents = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      tenantId: "tenant-alpha",
      limit: 10
    });

    const betaEvents = await listAuditEvents({
      action,
      entity: "audit-runtime-test",
      tenantId: "tenant-beta",
      limit: 10
    });

    expect(alphaEvents).toHaveLength(1);
    expect(alphaEvents[0].entityId).toBe("tenant-alpha-case");
    expect(alphaEvents[0].metadata?.tenantId).toBe("tenant-alpha");

    expect(betaEvents).toHaveLength(1);
    expect(betaEvents[0].entityId).toBe("tenant-beta-case");
    expect(betaEvents[0].metadata?.tenantId).toBe("tenant-beta");
  });

  it("filters audit events by entityId", async () => {
    const action = `test.audit.entity-id.${Date.now()}`;

    await recordAdminAuditEvent({
      action,
      entity: "module-settings",
      entityId: "intelligence",
      metadata: {
        marker: "intelligence-settings"
      }
    });

    await recordAdminAuditEvent({
      action,
      entity: "module-settings",
      entityId: "inventory",
      metadata: {
        marker: "inventory-settings"
      }
    });

    const events = await listAuditEvents({
      action,
      entity: "module-settings",
      entityId: "intelligence",
      limit: 10
    });

    expect(events).toHaveLength(1);
    expect(events[0].entityId).toBe("intelligence");
    expect(events[0].metadata?.marker).toBe("intelligence-settings");
  });

  it("rejects stale settings writes using expectedVersion", async () => {
    const moduleId = "inventory";
    const tenantId = `tenant-version-${Date.now()}`;

    const firstWrite = await updateModuleSettings(
      moduleId,
      {
        enabled: true,
        refreshIntervalSeconds: 60
      },
      { tenantId }
    );

    await expect(
      patchModuleSettings(
        moduleId,
        {
          refreshIntervalSeconds: 90
        },
        {
          tenantId,
          expectedVersion: firstWrite.version - 1
        }
      )
    ).rejects.toThrow("settings-version-conflict");
  });

  it("dispatches intelligence alerts with policy retries and idempotency", async () => {
    const tenantId = `tenant-policy-${Date.now()}`;

    const policy = await upsertIntelligenceAlertPolicy(
      {
        id: "ops-alerts",
        name: "Operations Alerts",
        enabled: true,
        webhookUrl: "https://example.com/webhook",
        severities: ["high"],
        retryLimit: 2
      },
      { tenantId }
    );

    expect(policy.id).toBe("ops-alerts");

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response("failure", { status: 500 }))
      .mockResolvedValueOnce(new Response("ok", { status: 200 }));

    const alerts = [
      {
        id: "risk-escalation",
        severity: "high" as const,
        title: "Risk load increasing",
        detail: "Risk index increased."
      }
    ];

    const firstDispatch = await dispatchIntelligenceAlerts(alerts, {
      tenantId,
      profileId: "commerce",
      windowToken: "window-a"
    });

    expect(firstDispatch).toHaveLength(1);
    expect(firstDispatch[0].status).toBe("delivered");
    expect(firstDispatch[0].attempts).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondDispatch = await dispatchIntelligenceAlerts(alerts, {
      tenantId,
      profileId: "commerce",
      windowToken: "window-a"
    });

    expect(secondDispatch).toHaveLength(1);
    expect(secondDispatch[0].status).toBe("skipped");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const policies = await listIntelligenceAlertPolicies({ tenantId });
    expect(policies.some((item) => item.id === "ops-alerts")).toBe(true);
  });

  it("filters dispatch by policy severities and alertIds", async () => {
    const tenantId = `tenant-policy-filter-${Date.now()}`;

    await upsertIntelligenceAlertPolicy(
      {
        id: "targeted-risk",
        name: "Targeted Risk",
        enabled: true,
        webhookUrl: "https://example.com/targeted",
        severities: ["medium"],
        alertIds: ["risk-escalation"],
        retryLimit: 1
      },
      { tenantId }
    );

    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response("failure", { status: 503 }));

    const results = await dispatchIntelligenceAlerts(
      [
        {
          id: "risk-escalation",
          severity: "medium",
          title: "Risk increasing",
          detail: "Risk trend rose."
        },
        {
          id: "authorization-pressure",
          severity: "medium",
          title: "Denied events",
          detail: "Denied events rose."
        },
        {
          id: "security-score-low",
          severity: "high",
          title: "Security low",
          detail: "Security score is low."
        }
      ],
      {
        tenantId,
        profileId: "saas",
        windowToken: "window-filter"
      }
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results).toHaveLength(1);
    expect(results[0].alertId).toBe("risk-escalation");
    expect(results[0].status).toBe("failed");
    expect(results[0].attempts).toBe(1);
  });

  it("lists intelligence delivery history with limit and filters", async () => {
    const tenantId = `tenant-delivery-history-${Date.now()}`;

    await upsertIntelligenceAlertPolicy(
      {
        id: "history-policy",
        name: "History Policy",
        enabled: true,
        webhookUrl: "https://example.com/history",
        severities: ["high"],
        retryLimit: 1
      },
      { tenantId }
    );

    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("ok", { status: 200 }));

    await dispatchIntelligenceAlerts(
      [
        {
          id: "security-score-low",
          severity: "high",
          title: "Security low",
          detail: "Security score dropped."
        }
      ],
      {
        tenantId,
        profileId: "commerce",
        windowToken: "window-history-a"
      }
    );

    await dispatchIntelligenceAlerts(
      [
        {
          id: "security-score-low",
          severity: "high",
          title: "Security low",
          detail: "Security score dropped."
        }
      ],
      {
        tenantId,
        profileId: "commerce",
        windowToken: "window-history-b"
      }
    );

    const all = await listIntelligenceAlertDeliveries({ tenantId, limit: 10 });
    expect(all.length).toBeGreaterThanOrEqual(2);

    const filteredWindow = await listIntelligenceAlertDeliveries({
      tenantId,
      windowToken: "window-history-b",
      limit: 10
    });
    expect(filteredWindow).toHaveLength(1);
    expect(filteredWindow[0].windowToken).toBe("window-history-b");

    const limited = await listIntelligenceAlertDeliveries({ tenantId, limit: 1 });
    expect(limited).toHaveLength(1);
  });

  it("manages intelligence dispatch schedules with due detection and run marks", async () => {
    const tenantId = `tenant-schedule-${Date.now()}`;
    const now = new Date();
    const dueTime = new Date(now.getTime() - 5 * 60 * 1000).toISOString();

    const saved = await upsertIntelligenceDispatchSchedule(
      {
        id: "hourly-commerce",
        name: "Hourly Commerce",
        profileId: "commerce",
        windowDays: 7,
        cadenceMinutes: 60,
        cooldownMinutes: 10,
        thresholds: {
          warningFailureRatePct: 4,
          criticalFailureRatePct: 12,
          warningOverdueMinutes: 20,
          criticalOverdueMinutes: 80,
          warningSuccessRatePct: 95
        },
        nextRunAt: dueTime,
        enabled: true
      },
      { tenantId }
    );

    expect(saved.id).toBe("hourly-commerce");
    expect(saved.thresholds?.warningFailureRatePct).toBe(4);

    const allSchedules = await listIntelligenceDispatchSchedules({ tenantId });
    expect(allSchedules.some((schedule) => schedule.id === "hourly-commerce")).toBe(true);
    expect(allSchedules[0].thresholds?.criticalOverdueMinutes).toBe(80);

    const dueSchedules = await listDueIntelligenceDispatchSchedules({
      tenantId,
      now: now.toISOString(),
      limit: 10
    });
    expect(dueSchedules).toHaveLength(1);
    expect(dueSchedules[0].id).toBe("hourly-commerce");

    const runAt = now.toISOString();
    const marked = await markIntelligenceDispatchScheduleRun("hourly-commerce", {
      tenantId,
      runAt
    });
    expect(marked?.lastRunAt).toBe(runAt);
    expect(marked?.nextRunAt).toBe(new Date(now.getTime() + 60 * 60 * 1000).toISOString());
    expect(marked?.thresholds?.warningSuccessRatePct).toBe(95);

    const dueAfterMark = await listDueIntelligenceDispatchSchedules({
      tenantId,
      now: now.toISOString(),
      limit: 10
    });
    expect(dueAfterMark).toHaveLength(0);

    await deleteIntelligenceDispatchSchedule("hourly-commerce", { tenantId });
    const afterDelete = await listIntelligenceDispatchSchedules({ tenantId });
    expect(afterDelete.some((schedule) => schedule.id === "hourly-commerce")).toBe(false);
  });

  it("rejects stale policy writes using expectedVersion", async () => {
    const tenantId = `tenant-policy-version-${Date.now()}`;

    const created = await upsertIntelligenceAlertPolicy(
      {
        id: "versioned-policy",
        name: "Versioned Policy",
        enabled: true,
        webhookUrl: "https://example.com/versioned",
        severities: ["high"],
        retryLimit: 2
      },
      { tenantId }
    );

    expect(created.version).toBeGreaterThan(0);

    await expect(
      upsertIntelligenceAlertPolicy(
        {
          id: "versioned-policy",
          name: "Versioned Policy Updated",
          enabled: true,
          webhookUrl: "https://example.com/versioned",
          severities: ["high"],
          retryLimit: 2
        },
        {
          tenantId,
          expectedVersion: created.version - 1
        }
      )
    ).rejects.toThrow("policy-version-conflict");

    await expect(
      deleteIntelligenceAlertPolicy("versioned-policy", {
        tenantId,
        expectedVersion: created.version - 1
      })
    ).rejects.toThrow("policy-version-conflict");
  });

  it("rejects stale schedule writes using expectedVersion", async () => {
    const tenantId = `tenant-schedule-version-${Date.now()}`;

    const created = await upsertIntelligenceDispatchSchedule(
      {
        id: "versioned-schedule",
        name: "Versioned Schedule",
        profileId: "commerce",
        windowDays: 7,
        cadenceMinutes: 60,
        cooldownMinutes: 10,
        nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
        enabled: true
      },
      { tenantId }
    );

    expect(created.version).toBeGreaterThan(0);

    await expect(
      upsertIntelligenceDispatchSchedule(
        {
          id: "versioned-schedule",
          name: "Versioned Schedule Updated",
          profileId: "commerce",
          windowDays: 14,
          cadenceMinutes: 60,
          cooldownMinutes: 10,
          nextRunAt: new Date(Date.now() + 60 * 60 * 1000).toISOString(),
          enabled: true
        },
        {
          tenantId,
          expectedVersion: created.version - 1
        }
      )
    ).rejects.toThrow("schedule-version-conflict");

    await expect(
      deleteIntelligenceDispatchSchedule("versioned-schedule", {
        tenantId,
        expectedVersion: created.version - 1
      })
    ).rejects.toThrow("schedule-version-conflict");
  });
});
