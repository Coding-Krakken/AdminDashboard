import { describe, expect, it } from "vitest";
import { summarizeScheduleRun } from "../intelligence-automation";

describe("intelligence automation helpers", () => {
  it("summarizes schedule run delivery counts", () => {
    const summary = summarizeScheduleRun({
      nowIso: "2026-05-22T12:30:00.000Z",
      deliveries: [
        { status: "delivered", attempts: 1, deliveredAt: "2026-05-22T12:20:00.000Z" },
        { status: "failed", attempts: 2, deliveredAt: "2026-05-22T12:10:00.000Z" },
        { status: "skipped", attempts: 0, deliveredAt: "2026-05-22T12:05:00.000Z" }
      ],
      schedule: {
        enabled: true,
        nextRunAt: "2026-05-22T12:00:00.000Z"
      }
    });

    expect(summary.deliveryCount).toBe(3);
    expect(summary.deliveredCount).toBe(1);
    expect(summary.failedCount).toBe(1);
    expect(summary.skippedCount).toBe(1);
    expect(summary.readinessStatus).toBe("critical");
    expect(summary.thresholdsApplied.warningFailureRatePct).toBeUndefined();
  });

  it("applies schedule-level threshold overrides", () => {
    const summary = summarizeScheduleRun({
      nowIso: "2026-05-22T12:30:00.000Z",
      defaultThresholds: {
        warningFailureRatePct: 3,
        criticalFailureRatePct: 10,
        warningOverdueMinutes: 30,
        criticalOverdueMinutes: 120,
        warningSuccessRatePct: 97
      },
      deliveries: [
        { status: "delivered", attempts: 1, deliveredAt: "2026-05-22T12:20:00.000Z" },
        { status: "failed", attempts: 1, deliveredAt: "2026-05-22T12:10:00.000Z" }
      ],
      schedule: {
        enabled: true,
        nextRunAt: "2026-05-22T12:25:00.000Z",
        thresholds: {
          warningFailureRatePct: 60,
          criticalFailureRatePct: 80,
          warningOverdueMinutes: 20,
          criticalOverdueMinutes: 40,
          warningSuccessRatePct: 30
        }
      }
    });

    expect(summary.readinessStatus).toBe("healthy");
    expect(summary.thresholdsApplied.warningFailureRatePct).toBe(60);
    expect(summary.thresholdsApplied.criticalFailureRatePct).toBe(80);
    expect(summary.thresholdsApplied.warningOverdueMinutes).toBe(20);
    expect(summary.thresholdsApplied.criticalOverdueMinutes).toBe(40);
    expect(summary.thresholdsApplied.warningSuccessRatePct).toBe(30);
  });

  it("inherits default thresholds when schedule overrides are absent", () => {
    const summary = summarizeScheduleRun({
      nowIso: "2026-05-22T12:30:00.000Z",
      defaultThresholds: {
        warningFailureRatePct: 4,
        criticalFailureRatePct: 12,
        warningOverdueMinutes: 45,
        criticalOverdueMinutes: 180,
        warningSuccessRatePct: 96
      },
      deliveries: [{ status: "delivered", attempts: 1 }],
      schedule: {
        enabled: true,
        nextRunAt: "2026-05-22T12:35:00.000Z"
      }
    });

    expect(summary.thresholdsApplied.warningFailureRatePct).toBe(4);
    expect(summary.thresholdsApplied.criticalFailureRatePct).toBe(12);
    expect(summary.thresholdsApplied.warningOverdueMinutes).toBe(45);
    expect(summary.thresholdsApplied.criticalOverdueMinutes).toBe(180);
    expect(summary.thresholdsApplied.warningSuccessRatePct).toBe(96);
  });
});
