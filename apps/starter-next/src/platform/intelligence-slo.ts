import type { AutomationReadiness } from "./intelligence";

export interface AutomationSloThresholds {
  maxFailureRatePct: number;
  minSuccessRatePct: number;
  maxOverdueSchedules: number;
  maxStaleLagMinutes: number;
  maxP95Attempts: number;
  maxFailureRateDeltaPct: number;
}

export interface AutomationSloCheck {
  id:
    | "failure-rate"
    | "failure-rate-delta"
    | "success-rate"
    | "overdue-schedules"
    | "stale-lag"
    | "attempts-p95";
  label: string;
  comparator: "<=" | ">=";
  value: number | null;
  target: number;
  status: "pass" | "fail";
  unit: "%" | "minutes" | "count" | "attempts";
  detail: string;
}

export interface AutomationSloReport {
  status: "pass" | "fail";
  releaseReady: boolean;
  checks: AutomationSloCheck[];
}

const defaultSloThresholds: AutomationSloThresholds = {
  maxFailureRatePct: 2,
  minSuccessRatePct: 98,
  maxOverdueSchedules: 0,
  maxStaleLagMinutes: 30,
  maxP95Attempts: 2,
  maxFailureRateDeltaPct: 5
};

function normalizeThresholds(
  input: Partial<AutomationSloThresholds> | undefined
): AutomationSloThresholds {
  return {
    maxFailureRatePct:
      typeof input?.maxFailureRatePct === "number"
        ? Math.max(0, Math.min(100, input.maxFailureRatePct))
        : defaultSloThresholds.maxFailureRatePct,
    minSuccessRatePct:
      typeof input?.minSuccessRatePct === "number"
        ? Math.max(0, Math.min(100, input.minSuccessRatePct))
        : defaultSloThresholds.minSuccessRatePct,
    maxOverdueSchedules:
      typeof input?.maxOverdueSchedules === "number"
        ? Math.max(0, Math.trunc(input.maxOverdueSchedules))
        : defaultSloThresholds.maxOverdueSchedules,
    maxStaleLagMinutes:
      typeof input?.maxStaleLagMinutes === "number"
        ? Math.max(0, Math.trunc(input.maxStaleLagMinutes))
        : defaultSloThresholds.maxStaleLagMinutes,
    maxP95Attempts:
      typeof input?.maxP95Attempts === "number"
        ? Math.max(0, input.maxP95Attempts)
        : defaultSloThresholds.maxP95Attempts,
    maxFailureRateDeltaPct:
      typeof input?.maxFailureRateDeltaPct === "number"
        ? Math.max(0, Math.min(100, input.maxFailureRateDeltaPct))
        : defaultSloThresholds.maxFailureRateDeltaPct
  };
}

function failDetail(value: number | null, target: number, comparator: "<=" | ">="): string {
  if (value === null) {
    return "No recent deliveries available for this check.";
  }

  return comparator === "<="
    ? `Value ${value} exceeded max ${target}.`
    : `Value ${value} fell below min ${target}.`;
}

export function deriveAutomationSlo(options: {
  readiness: AutomationReadiness;
  previousReadiness?: AutomationReadiness;
  thresholds?: Partial<AutomationSloThresholds>;
}): AutomationSloReport {
  const thresholds = normalizeThresholds(options.thresholds);
  const staleLag = options.readiness.delivery.staleLagMinutes;
  const failureRateDelta =
    options.previousReadiness &&
    typeof options.previousReadiness.delivery.failureRatePct === "number"
      ? Math.max(
          0,
          options.readiness.delivery.failureRatePct -
            options.previousReadiness.delivery.failureRatePct
        )
      : null;

  const checks: AutomationSloCheck[] = [
    {
      id: "failure-rate",
      label: "Failure Rate",
      comparator: "<=",
      value: options.readiness.delivery.failureRatePct,
      target: thresholds.maxFailureRatePct,
      unit: "%",
      status:
        options.readiness.delivery.failureRatePct <= thresholds.maxFailureRatePct
          ? "pass"
          : "fail",
      detail:
        options.readiness.delivery.failureRatePct <= thresholds.maxFailureRatePct
          ? "Failure rate is within SLO."
          : failDetail(options.readiness.delivery.failureRatePct, thresholds.maxFailureRatePct, "<=")
    },
    {
      id: "failure-rate-delta",
      label: "Failure Rate Regression",
      comparator: "<=",
      value: failureRateDelta,
      target: thresholds.maxFailureRateDeltaPct,
      unit: "%",
      status:
        failureRateDelta === null || failureRateDelta <= thresholds.maxFailureRateDeltaPct
          ? "pass"
          : "fail",
      detail:
        failureRateDelta === null
          ? "No previous window baseline available."
          : failureRateDelta <= thresholds.maxFailureRateDeltaPct
            ? "Failure-rate trend is within SLO regression bounds."
            : failDetail(failureRateDelta, thresholds.maxFailureRateDeltaPct, "<=")
    },
    {
      id: "success-rate",
      label: "Success Rate",
      comparator: ">=",
      value: options.readiness.delivery.successRatePct,
      target: thresholds.minSuccessRatePct,
      unit: "%",
      status:
        options.readiness.delivery.successRatePct >= thresholds.minSuccessRatePct
          ? "pass"
          : "fail",
      detail:
        options.readiness.delivery.successRatePct >= thresholds.minSuccessRatePct
          ? "Success rate meets SLO."
          : failDetail(options.readiness.delivery.successRatePct, thresholds.minSuccessRatePct, ">=")
    },
    {
      id: "overdue-schedules",
      label: "Overdue Schedules",
      comparator: "<=",
      value: options.readiness.schedules.overdue,
      target: thresholds.maxOverdueSchedules,
      unit: "count",
      status:
        options.readiness.schedules.overdue <= thresholds.maxOverdueSchedules
          ? "pass"
          : "fail",
      detail:
        options.readiness.schedules.overdue <= thresholds.maxOverdueSchedules
          ? "No unexpected overdue schedules."
          : failDetail(options.readiness.schedules.overdue, thresholds.maxOverdueSchedules, "<=")
    },
    {
      id: "stale-lag",
      label: "Delivery Freshness",
      comparator: "<=",
      value: staleLag,
      target: thresholds.maxStaleLagMinutes,
      unit: "minutes",
      status:
        typeof staleLag === "number" && staleLag <= thresholds.maxStaleLagMinutes
          ? "pass"
          : "fail",
      detail:
        typeof staleLag === "number" && staleLag <= thresholds.maxStaleLagMinutes
          ? "Delivery freshness is within SLO."
          : failDetail(staleLag, thresholds.maxStaleLagMinutes, "<=")
    },
    {
      id: "attempts-p95",
      label: "Retry Pressure p95",
      comparator: "<=",
      value: options.readiness.delivery.p95Attempts,
      target: thresholds.maxP95Attempts,
      unit: "attempts",
      status:
        options.readiness.delivery.p95Attempts <= thresholds.maxP95Attempts
          ? "pass"
          : "fail",
      detail:
        options.readiness.delivery.p95Attempts <= thresholds.maxP95Attempts
          ? "Retry pressure is within SLO."
          : failDetail(options.readiness.delivery.p95Attempts, thresholds.maxP95Attempts, "<=")
    }
  ];

  const status: AutomationSloReport["status"] = checks.some((check) => check.status === "fail")
    ? "fail"
    : "pass";

  return {
    status,
    releaseReady: status === "pass",
    checks
  };
}