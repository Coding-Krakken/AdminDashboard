import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { summarizeScheduleRun } from "@/platform/intelligence-automation";
import { buildIntelligenceDispatchSnapshot } from "@/platform/intelligence-runtime";
import {
  buildScheduleRunAuditMetadata,
  buildScheduleRunResponseEntry
} from "@/platform/intelligence-schedule-run-contract";
import { extractAutomationReadinessThresholds } from "@/platform/intelligence-thresholds";
import {
  dispatchIntelligenceAlerts,
  getModuleSettings,
  listDueIntelligenceDispatchSchedules,
  markIntelligenceDispatchScheduleRun,
  recordAdminAuditEvent
} from "@/platform/runtime";

function toHourToken(iso: string): string {
  return iso.slice(0, 13);
}

export async function POST(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json().catch(() => ({}))) as {
      limit?: number;
      now?: string;
    };

    const nowIso =
      typeof body.now === "string" && !Number.isNaN(Date.parse(body.now))
        ? new Date(Date.parse(body.now)).toISOString()
        : new Date().toISOString();

    const dueSchedules = await listDueIntelligenceDispatchSchedules({
      request,
      now: nowIso,
      limit: typeof body.limit === "number" ? body.limit : 10
    });

    const intelligenceSettingsSnapshot = await getModuleSettings("intelligence", {
      request
    });
    const intelligenceSettings =
      intelligenceSettingsSnapshot?.values &&
      typeof intelligenceSettingsSnapshot.values === "object"
        ? (intelligenceSettingsSnapshot.values as Record<string, unknown>)
        : {};
    const defaultThresholds = extractAutomationReadinessThresholds(intelligenceSettings);

    const runs: Array<{
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
      thresholdsApplied: {
        warningFailureRatePct?: number;
        criticalFailureRatePct?: number;
        warningOverdueMinutes?: number;
        criticalOverdueMinutes?: number;
        warningSuccessRatePct?: number;
      };
    }> = [];

    for (const schedule of dueSchedules) {
      const snapshot = await buildIntelligenceDispatchSnapshot({
        request,
        profile: schedule.profileId,
        windowDays: schedule.windowDays
      }).catch((error) => {
        if (error instanceof Error && error.message === "audit-access-required") {
          return null;
        }

        throw error;
      });

      if (!snapshot) {
        continue;
      }

      const windowToken = `schedule:${schedule.id}:${toHourToken(nowIso)}`;
      const deliveries = await dispatchIntelligenceAlerts(snapshot.alerts, {
        request,
        profileId: snapshot.runtime.profile.id,
        windowToken,
        generatedAt: nowIso,
        policyIds: schedule.policyIds
      });

      await markIntelligenceDispatchScheduleRun(schedule.id, {
        request,
        runAt: nowIso
      });

      const runSummary = summarizeScheduleRun({
        deliveries,
        defaultThresholds,
        schedule: {
          enabled: schedule.enabled,
          nextRunAt: schedule.nextRunAt,
          thresholds: schedule.thresholds
        },
        nowIso
      });

      const runEntry = buildScheduleRunResponseEntry({
        scheduleId: schedule.id,
        profileId: snapshot.runtime.profile.id,
        windowDays: schedule.windowDays,
        alertCount: snapshot.alerts.length,
        windowToken,
        summary: runSummary
      });
      runs.push(runEntry);

      const metadata = buildScheduleRunAuditMetadata({
        profileId: snapshot.runtime.profile.id,
        windowDays: schedule.windowDays,
        windowToken,
        alertCount: snapshot.alerts.length,
        defaultThresholds,
        scheduleThresholds: schedule.thresholds,
        summary: runSummary
      });

      await recordAdminAuditEvent({
        request,
        action: "intelligence.schedule.run",
        entity: "intelligence-schedule",
        entityId: schedule.id,
        metadata
      });
    }

    return NextResponse.json({
      now: nowIso,
      dueCount: dueSchedules.length,
      runCount: runs.length,
      runs
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown schedule run error."
      },
      { status: 500 }
    );
  }
}
