import { describe, expect, it } from "vitest";
import {
  buildDailyAuditBreakdown,
  buildAuditWindowAnalytics,
  compareAuditWindows,
  deriveAutomationReadiness,
  deriveIntelligenceAlerts,
  deriveIntelligenceRecommendations,
  deriveIntelligenceKpis
} from "../intelligence";

describe("intelligence analytics", () => {
  it("builds daily audit breakdown rows with reliability and risk", () => {
    const breakdown = buildDailyAuditBreakdown(
      [
        {
          actorId: "u1",
          action: "authz.denied",
          entity: "admin-api",
          entityId: "runtime:read",
          metadata: { at: "2026-05-21T09:00:00.000Z" }
        },
        {
          actorId: "u2",
          action: "incident.created",
          entity: "incident",
          entityId: "inc-1",
          metadata: { at: "2026-05-21T12:00:00.000Z" }
        }
      ],
      {
        windowDays: 2,
        now: new Date("2026-05-22T12:00:00.000Z")
      }
    );

    expect(breakdown).toHaveLength(3);
    const activeDay = breakdown.find((row) => row.day === "2026-05-21");
    expect(activeDay?.denied).toBe(1);
    expect(activeDay?.incidents).toBe(1);
    expect(activeDay?.riskLoad).toBe(13);
  });

  it("builds windowed throughput/reliability/risk series from audit events", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const events = [
      {
        actorId: "u1",
        action: "settings.update",
        entity: "settings",
        entityId: "global",
        metadata: { at: "2026-05-21T09:00:00.000Z" }
      },
      {
        actorId: "u2",
        action: "authz.denied",
        entity: "admin-api",
        entityId: "runtime:read",
        metadata: { at: "2026-05-21T10:00:00.000Z" }
      },
      {
        actorId: "u2",
        action: "incident.created",
        entity: "incident",
        entityId: "inc-101",
        metadata: { at: "2026-05-22T07:00:00.000Z" }
      }
    ];

    const analytics = buildAuditWindowAnalytics(events, {
      windowDays: 3,
      now
    });

    expect(analytics.total).toBe(3);
    expect(analytics.denied).toBe(1);
    expect(analytics.trendSeries.throughput).toEqual([0, 2, 1]);
    expect(analytics.trendSeries.reliability[1]).toBe(50);
    expect(analytics.trendSeries.riskLoad[1]).toBe(8);
    expect(analytics.trendSeries.riskLoad[2]).toBe(5);
  });

  it("ignores events without valid timestamps and returns top aggregations", () => {
    const analytics = buildAuditWindowAnalytics(
      [
        {
          actorId: "u1",
          action: "runtime.read",
          entity: "runtime",
          entityId: "dashboard",
          metadata: {}
        },
        {
          actorId: "u1",
          action: "runtime.read",
          entity: "runtime",
          entityId: "dashboard",
          metadata: { at: "2026-05-22T11:00:00.000Z" }
        }
      ],
      {
        windowDays: 7,
        now: new Date("2026-05-22T12:00:00.000Z")
      }
    );

    expect(analytics.total).toBe(1);
    expect(analytics.topActions[0]).toEqual({ action: "runtime.read", count: 1 });
    expect(analytics.topEntities[0]).toEqual({ entity: "runtime", count: 1 });
  });

  it("derives KPI scores from runtime and audit analytics", () => {
    const analytics = buildAuditWindowAnalytics(
      [
        {
          actorId: "u1",
          action: "authz.denied",
          entity: "admin-api",
          entityId: "settings:write",
          metadata: { at: "2026-05-22T11:00:00.000Z" }
        },
        {
          actorId: "u1",
          action: "runtime.read",
          entity: "runtime",
          entityId: "dashboard",
          metadata: { at: "2026-05-22T11:05:00.000Z" }
        }
      ],
      {
        windowDays: 3,
        now: new Date("2026-05-22T12:00:00.000Z")
      }
    );

    const kpis = deriveIntelligenceKpis({
      moduleCount: 12,
      pluginCount: 5,
      enabledFlagCount: 8,
      strictSignatures: true,
      acceptedSigningKeys: 2,
      auditAnalytics: analytics
    });

    expect(kpis.moduleCount).toBe(12);
    expect(kpis.securityScore).toBeGreaterThan(70);
    expect(kpis.reliabilityScore).toBeLessThan(100);
    expect(kpis.healthScore).toBeLessThan(95);
  });

  it("compares current and previous windows and emits alerts", () => {
    const now = new Date("2026-05-22T12:00:00.000Z");
    const current = buildAuditWindowAnalytics(
      [
        {
          actorId: "u1",
          action: "authz.denied",
          entity: "admin-api",
          entityId: "settings:write",
          metadata: { at: "2026-05-22T10:00:00.000Z" }
        },
        {
          actorId: "u1",
          action: "incident.created",
          entity: "incident",
          entityId: "inc-1",
          metadata: { at: "2026-05-22T10:20:00.000Z" }
        }
      ],
      { windowDays: 7, now }
    );

    const previous = buildAuditWindowAnalytics(
      [
        {
          actorId: "u1",
          action: "runtime.read",
          entity: "runtime",
          entityId: "dashboard",
          metadata: { at: "2026-05-15T10:00:00.000Z" }
        }
      ],
      { windowDays: 7, now: new Date("2026-05-15T12:00:00.000Z") }
    );

    const comparison = compareAuditWindows(current, previous);
    expect(comparison.riskDeltaPct).toBeGreaterThan(0);

    const kpis = deriveIntelligenceKpis({
      moduleCount: 12,
      pluginCount: 5,
      enabledFlagCount: 9,
      strictSignatures: true,
      acceptedSigningKeys: 2,
      auditAnalytics: current
    });

    const alerts = deriveIntelligenceAlerts({
      current,
      comparison,
      kpis
    });

    expect(alerts.length).toBeGreaterThan(0);
    expect(alerts.some((item) => item.id === "authorization-pressure")).toBe(true);

    const recommendations = deriveIntelligenceRecommendations({
      windowDays: 7,
      profileId: "commerce",
      current,
      comparison,
      alerts
    });

    expect(recommendations.length).toBeGreaterThan(0);
    expect(recommendations.some((item) => item.priority === "p1")).toBe(true);
  });

  it("derives automation readiness from delivery and schedule snapshots", () => {
    const readiness = deriveAutomationReadiness({
      now: new Date("2026-05-22T12:30:00.000Z"),
      deliveries: [
        {
          status: "delivered",
          attempts: 1,
          at: "2026-05-22T12:20:00.000Z"
        },
        {
          status: "failed",
          attempts: 3,
          at: "2026-05-22T12:10:00.000Z"
        },
        {
          status: "skipped",
          attempts: 0,
          at: "2026-05-22T12:05:00.000Z"
        }
      ],
      schedules: [
        {
          enabled: true,
          nextRunAt: "2026-05-22T11:55:00.000Z"
        },
        {
          enabled: true,
          nextRunAt: "2026-05-22T12:45:00.000Z"
        },
        {
          enabled: false,
          nextRunAt: "2026-05-22T10:00:00.000Z"
        }
      ]
    });

    expect(readiness.delivery.total).toBe(3);
    expect(readiness.delivery.successRatePct).toBe(50);
    expect(readiness.delivery.failureRatePct).toBe(50);
    expect(readiness.delivery.p95Attempts).toBe(3);
    expect(readiness.schedules.total).toBe(3);
    expect(readiness.schedules.enabled).toBe(2);
    expect(readiness.schedules.overdue).toBe(1);
    expect(readiness.status).toBe("critical");
  });

  it("applies custom readiness thresholds", () => {
    const baseInput = {
      now: new Date("2026-05-22T12:30:00.000Z"),
      deliveries: [
        {
          status: "delivered" as const,
          attempts: 1,
          at: "2026-05-22T12:20:00.000Z"
        },
        {
          status: "failed" as const,
          attempts: 2,
          at: "2026-05-22T12:10:00.000Z"
        }
      ],
      schedules: [
        {
          enabled: true,
          nextRunAt: "2026-05-22T12:25:00.000Z"
        }
      ]
    };

    const strictReadiness = deriveAutomationReadiness({
      ...baseInput,
      thresholds: {
        warningFailureRatePct: 1,
        criticalFailureRatePct: 40,
        warningOverdueMinutes: 2,
        criticalOverdueMinutes: 10,
        warningSuccessRatePct: 99
      }
    });

    expect(strictReadiness.status).toBe("critical");

    const relaxedReadiness = deriveAutomationReadiness({
      ...baseInput,
      thresholds: {
        warningFailureRatePct: 60,
        criticalFailureRatePct: 80,
        warningOverdueMinutes: 20,
        criticalOverdueMinutes: 40,
        warningSuccessRatePct: 30
      }
    });

    expect(relaxedReadiness.status).toBe("healthy");
  });
});
