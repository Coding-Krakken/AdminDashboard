import { describe, expect, it } from "vitest";
import { deriveAutomationSlo } from "../intelligence-slo";

describe("intelligence automation SLO", () => {
  it("marks release ready when all checks pass", () => {
    const report = deriveAutomationSlo({
      readiness: {
        status: "healthy",
        delivery: {
          total: 10,
          delivered: 10,
          failed: 0,
          skipped: 0,
          successRatePct: 100,
          failureRatePct: 0,
          p95Attempts: 1,
          staleLagMinutes: 5
        },
        schedules: {
          total: 4,
          enabled: 4,
          overdue: 0,
          maxOverdueMinutes: 0
        }
      }
    });

    expect(report.status).toBe("pass");
    expect(report.releaseReady).toBe(true);
    expect(report.checks.every((check) => check.status === "pass")).toBe(true);
  });

  it("fails release gate when thresholds are violated", () => {
    const report = deriveAutomationSlo({
      readiness: {
        status: "critical",
        delivery: {
          total: 4,
          delivered: 2,
          failed: 2,
          skipped: 0,
          successRatePct: 50,
          failureRatePct: 50,
          p95Attempts: 4,
          staleLagMinutes: 120
        },
        schedules: {
          total: 3,
          enabled: 3,
          overdue: 2,
          maxOverdueMinutes: 60
        }
      },
      thresholds: {
        maxFailureRatePct: 5,
        minSuccessRatePct: 95,
        maxOverdueSchedules: 0,
        maxStaleLagMinutes: 30,
        maxP95Attempts: 2
      }
    });

    expect(report.status).toBe("fail");
    expect(report.releaseReady).toBe(false);
    expect(report.checks.some((check) => check.status === "fail")).toBe(true);
  });

  it("fails regression check when failure rate spikes over baseline", () => {
    const report = deriveAutomationSlo({
      readiness: {
        status: "warning",
        delivery: {
          total: 10,
          delivered: 8,
          failed: 2,
          skipped: 0,
          successRatePct: 80,
          failureRatePct: 20,
          p95Attempts: 2,
          staleLagMinutes: 5
        },
        schedules: {
          total: 2,
          enabled: 2,
          overdue: 0,
          maxOverdueMinutes: 0
        }
      },
      previousReadiness: {
        status: "healthy",
        delivery: {
          total: 10,
          delivered: 9,
          failed: 1,
          skipped: 0,
          successRatePct: 90,
          failureRatePct: 10,
          p95Attempts: 1,
          staleLagMinutes: 5
        },
        schedules: {
          total: 2,
          enabled: 2,
          overdue: 0,
          maxOverdueMinutes: 0
        }
      },
      thresholds: {
        maxFailureRateDeltaPct: 5,
        maxFailureRatePct: 25,
        minSuccessRatePct: 70,
        maxOverdueSchedules: 1,
        maxStaleLagMinutes: 30,
        maxP95Attempts: 3
      }
    });

    const regressionCheck = report.checks.find((check) => check.id === "failure-rate-delta");
    expect(regressionCheck?.status).toBe("fail");
    expect(report.releaseReady).toBe(false);
  });
});