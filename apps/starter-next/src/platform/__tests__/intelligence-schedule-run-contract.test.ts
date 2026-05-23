import { describe, expect, it } from "vitest";
import {
  buildScheduleRunAuditMetadata,
  buildScheduleRunResponseEntry
} from "../intelligence-schedule-run-contract";

describe("intelligence schedule run contract", () => {
  it("builds response entries with expected run fields", () => {
    const entry = buildScheduleRunResponseEntry({
      scheduleId: "hourly-commerce",
      profileId: "commerce",
      windowDays: 7,
      alertCount: 3,
      windowToken: "schedule:hourly-commerce:2026-05-22T12",
      summary: {
        deliveryCount: 3,
        deliveredCount: 2,
        failedCount: 1,
        skippedCount: 0,
        readinessStatus: "warning",
        thresholdsApplied: {
          warningFailureRatePct: 5
        }
      }
    });

    expect(entry.scheduleId).toBe("hourly-commerce");
    expect(entry.profileId).toBe("commerce");
    expect(entry.deliveryCount).toBe(3);
    expect(entry.readinessStatus).toBe("warning");
    expect(entry.thresholdsApplied.warningFailureRatePct).toBe(5);
  });

  it("builds audit metadata including default/override/applied thresholds", () => {
    const metadata = buildScheduleRunAuditMetadata({
      profileId: "commerce",
      windowDays: 14,
      windowToken: "schedule:hourly-commerce:2026-05-22T12",
      alertCount: 4,
      defaultThresholds: {
        warningFailureRatePct: 3
      },
      scheduleThresholds: {
        warningFailureRatePct: 6
      },
      summary: {
        deliveryCount: 4,
        deliveredCount: 3,
        failedCount: 1,
        skippedCount: 0,
        readinessStatus: "warning",
        thresholdsApplied: {
          warningFailureRatePct: 6
        }
      }
    });

    expect(metadata.deliveryCount).toBe(4);
    expect(metadata.readinessStatus).toBe("warning");
    expect(metadata.thresholds.default.warningFailureRatePct).toBe(3);
    expect(metadata.thresholds.scheduleOverride?.warningFailureRatePct).toBe(6);
    expect(metadata.thresholds.applied.warningFailureRatePct).toBe(6);
  });
});
