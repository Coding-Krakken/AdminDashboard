import { describe, expect, it } from "vitest";
import {
  extractAutomationReadinessThresholds,
  mergeAutomationReadinessThresholds
} from "../intelligence-thresholds";

describe("intelligence threshold utilities", () => {
  it("extracts and normalizes readiness thresholds", () => {
    const thresholds = extractAutomationReadinessThresholds({
      warningFailureRatePct: 150,
      criticalFailureRatePct: -5,
      warningOverdueMinutes: 75.9,
      criticalOverdueMinutes: 99999,
      warningSuccessRatePct: 88
    });

    expect(thresholds.warningFailureRatePct).toBe(100);
    expect(thresholds.criticalFailureRatePct).toBe(0);
    expect(thresholds.warningOverdueMinutes).toBe(75);
    expect(thresholds.criticalOverdueMinutes).toBe(24 * 60);
    expect(thresholds.warningSuccessRatePct).toBe(88);
  });

  it("merges schedule overrides on top of baseline thresholds", () => {
    const merged = mergeAutomationReadinessThresholds(
      {
        warningFailureRatePct: 3,
        criticalFailureRatePct: 10,
        warningOverdueMinutes: 30,
        criticalOverdueMinutes: 120,
        warningSuccessRatePct: 97
      },
      {
        warningFailureRatePct: 6,
        criticalOverdueMinutes: 180
      }
    );

    expect(merged.warningFailureRatePct).toBe(6);
    expect(merged.criticalFailureRatePct).toBe(10);
    expect(merged.warningOverdueMinutes).toBe(30);
    expect(merged.criticalOverdueMinutes).toBe(180);
    expect(merged.warningSuccessRatePct).toBe(97);
  });
});
