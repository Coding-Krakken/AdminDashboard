import { deriveAutomationReadiness } from "./intelligence";
import {
  extractAutomationReadinessThresholds,
  mergeAutomationReadinessThresholds,
  type ReadinessThresholdSource
} from "./intelligence-thresholds";

export interface ScheduleReadinessThresholdOverrides {
  warningFailureRatePct?: number;
  criticalFailureRatePct?: number;
  warningOverdueMinutes?: number;
  criticalOverdueMinutes?: number;
  warningSuccessRatePct?: number;
}

export interface ScheduleRunDeliverySnapshot {
  status: "delivered" | "failed" | "skipped";
  attempts: number;
  deliveredAt?: string;
}

export interface ScheduleRunSummaryInput {
  deliveries: ScheduleRunDeliverySnapshot[];
  defaultThresholds?: ReadinessThresholdSource;
  schedule: {
    enabled: boolean;
    nextRunAt: string;
    thresholds?: ReadinessThresholdSource;
  };
  nowIso: string;
}

export interface ScheduleRunSummary {
  deliveryCount: number;
  deliveredCount: number;
  failedCount: number;
  skippedCount: number;
  readinessStatus: "healthy" | "warning" | "critical";
  thresholdsApplied: ScheduleReadinessThresholdOverrides;
}

export interface ScheduleRunRecord {
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
  thresholdsApplied: ScheduleReadinessThresholdOverrides;
}

export function summarizeScheduleRun(input: ScheduleRunSummaryInput): ScheduleRunSummary {
  const deliveredCount = input.deliveries.filter((item) => item.status === "delivered").length;
  const failedCount = input.deliveries.filter((item) => item.status === "failed").length;
  const skippedCount = input.deliveries.filter((item) => item.status === "skipped").length;

  const parsedNow = Date.parse(input.nowIso);
  const effectiveThresholds = mergeAutomationReadinessThresholds(
    extractAutomationReadinessThresholds(input.defaultThresholds),
    extractAutomationReadinessThresholds(input.schedule.thresholds)
  );

  const scheduleReadiness = deriveAutomationReadiness({
    now: Number.isNaN(parsedNow) ? new Date() : new Date(parsedNow),
    deliveries: input.deliveries.map((item) => ({
      status: item.status,
      attempts: item.attempts,
      at: item.deliveredAt ?? input.nowIso
    })),
    schedules: [
      {
        enabled: input.schedule.enabled,
        nextRunAt: input.schedule.nextRunAt
      }
    ],
    thresholds: effectiveThresholds
  });

  return {
    deliveryCount: input.deliveries.length,
    deliveredCount,
    failedCount,
    skippedCount,
    readinessStatus: scheduleReadiness.status,
    thresholdsApplied: effectiveThresholds
  };
}

export function buildScheduleRunRecord(input: {
  schedule: {
    id: string;
    profileId: string;
    windowDays: number;
  };
  alertCount: number;
  windowToken: string;
  summary: ScheduleRunSummary;
}): ScheduleRunRecord {
  return {
    scheduleId: input.schedule.id,
    profileId: input.schedule.profileId,
    windowDays: input.schedule.windowDays,
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