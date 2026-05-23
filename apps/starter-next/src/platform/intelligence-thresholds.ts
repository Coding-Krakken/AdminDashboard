import type { AutomationReadinessThresholds } from "./intelligence";

export interface ReadinessThresholdSource {
  warningFailureRatePct?: unknown;
  criticalFailureRatePct?: unknown;
  warningOverdueMinutes?: unknown;
  criticalOverdueMinutes?: unknown;
  warningSuccessRatePct?: unknown;
}

function normalizePercent(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(100, value));
}

function normalizeMinutes(value: unknown): number | undefined {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return undefined;
  }

  return Math.max(0, Math.min(Math.trunc(value), 24 * 60));
}

export function extractAutomationReadinessThresholds(
  source: ReadinessThresholdSource | null | undefined
): Partial<AutomationReadinessThresholds> {
  const extracted: Partial<AutomationReadinessThresholds> = {};

  const warningFailureRatePct = normalizePercent(source?.warningFailureRatePct);
  if (typeof warningFailureRatePct === "number") {
    extracted.warningFailureRatePct = warningFailureRatePct;
  }

  const criticalFailureRatePct = normalizePercent(source?.criticalFailureRatePct);
  if (typeof criticalFailureRatePct === "number") {
    extracted.criticalFailureRatePct = criticalFailureRatePct;
  }

  const warningOverdueMinutes = normalizeMinutes(source?.warningOverdueMinutes);
  if (typeof warningOverdueMinutes === "number") {
    extracted.warningOverdueMinutes = warningOverdueMinutes;
  }

  const criticalOverdueMinutes = normalizeMinutes(source?.criticalOverdueMinutes);
  if (typeof criticalOverdueMinutes === "number") {
    extracted.criticalOverdueMinutes = criticalOverdueMinutes;
  }

  const warningSuccessRatePct = normalizePercent(source?.warningSuccessRatePct);
  if (typeof warningSuccessRatePct === "number") {
    extracted.warningSuccessRatePct = warningSuccessRatePct;
  }

  return extracted;
}

export function mergeAutomationReadinessThresholds(
  baseline: Partial<AutomationReadinessThresholds> | undefined,
  overrides: Partial<AutomationReadinessThresholds> | undefined
): Partial<AutomationReadinessThresholds> {
  const merged = {
    ...(baseline ?? {}),
    ...(overrides ?? {})
  };

  const compacted: Partial<AutomationReadinessThresholds> = {};
  if (typeof merged.warningFailureRatePct === "number") {
    compacted.warningFailureRatePct = merged.warningFailureRatePct;
  }
  if (typeof merged.criticalFailureRatePct === "number") {
    compacted.criticalFailureRatePct = merged.criticalFailureRatePct;
  }
  if (typeof merged.warningOverdueMinutes === "number") {
    compacted.warningOverdueMinutes = merged.warningOverdueMinutes;
  }
  if (typeof merged.criticalOverdueMinutes === "number") {
    compacted.criticalOverdueMinutes = merged.criticalOverdueMinutes;
  }
  if (typeof merged.warningSuccessRatePct === "number") {
    compacted.warningSuccessRatePct = merged.warningSuccessRatePct;
  }

  return compacted;
}