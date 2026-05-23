export interface ScheduleRunThresholdSnapshot {
  warningFailureRatePct?: number;
  criticalFailureRatePct?: number;
  warningOverdueMinutes?: number;
  criticalOverdueMinutes?: number;
  warningSuccessRatePct?: number;
}

export interface ScheduleRunSummaryContract {
  deliveryCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  readinessStatus: "healthy" | "warning" | "critical";
  thresholdsApplied: ScheduleRunThresholdSnapshot;
}

export interface ScheduleRunResponseEntry {
  scheduleId: string;
  profileId: string;
  windowDays: number;
  alertCount: number;
  deliveryCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  windowToken: string;
  readinessStatus: "healthy" | "warning" | "critical";
  thresholdsApplied: ScheduleRunThresholdSnapshot;
}

export function buildScheduleRunResponseEntry(input: {
  scheduleId: string;
  profileId: string;
  windowDays: number;
  alertCount: number;
  windowToken: string;
  summary: ScheduleRunSummaryContract;
}): ScheduleRunResponseEntry {
  return {
    scheduleId: input.scheduleId,
    profileId: input.profileId,
    windowDays: input.windowDays,
    alertCount: input.alertCount,
    deliveryCount: input.summary.deliveryCount,
    deliveredCount: input.summary.deliveredCount,
    failedCount: input.summary.failedCount,
    skippedCount: input.summary.skippedCount,
    windowToken: input.windowToken,
    readinessStatus: input.summary.readinessStatus,
    thresholdsApplied: input.summary.thresholdsApplied
  };
}

export function buildScheduleRunAuditMetadata(input: {
  profileId: string;
  windowDays: number;
  windowToken: string;
  alertCount: number;
  defaultThresholds: ScheduleRunThresholdSnapshot;
  scheduleThresholds?: ScheduleRunThresholdSnapshot;
  summary: ScheduleRunSummaryContract;
}) {
  return {
    profileId: input.profileId,
    windowDays: input.windowDays,
    windowToken: input.windowToken,
    alertCount: input.alertCount,
    deliveryCount: input.summary.deliveryCount,
    deliveredCount: input.summary.deliveredCount,
    failedCount: input.summary.failedCount,
    skippedCount: input.summary.skippedCount,
    readinessStatus: input.summary.readinessStatus,
    thresholds: {
      default: input.defaultThresholds,
      scheduleOverride: input.scheduleThresholds ?? null,
      applied: input.summary.thresholdsApplied
    }
  };
}