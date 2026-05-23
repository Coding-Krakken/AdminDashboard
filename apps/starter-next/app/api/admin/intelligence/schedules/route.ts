import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  deleteIntelligenceDispatchSchedule,
  listIntelligenceDispatchSchedules,
  recordAdminAuditEvent,
  upsertIntelligenceDispatchSchedule
} from "@/platform/runtime";

async function upsertSchedule(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as Record<string, unknown> & {
      expectedVersion?: number;
    };
    const schedule = await upsertIntelligenceDispatchSchedule(body, {
      request,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined
    });

    await recordAdminAuditEvent({
      request,
      action: "intelligence.schedule.upsert",
      entity: "intelligence-schedule",
      entityId: schedule.id,
      metadata: {
        enabled: schedule.enabled,
        profileId: schedule.profileId,
        windowDays: schedule.windowDays,
        cadenceMinutes: schedule.cadenceMinutes,
        cooldownMinutes: schedule.cooldownMinutes,
        nextRunAt: schedule.nextRunAt,
        thresholds: schedule.thresholds ?? null
      }
    });

    return NextResponse.json(schedule);
  } catch (error) {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.startsWith("schedule-version-conflict:")
    ) {
      const currentVersion = Number.parseInt(error.message.split(":")[1] ?? "0", 10);
      return NextResponse.json(
        {
          error: "Schedule version conflict.",
          code: "schedule-version-conflict",
          currentVersion: Number.isFinite(currentVersion) ? currentVersion : 0
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown schedule upsert error."
      },
      { status: 400 }
    );
  }
}

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const schedules = await listIntelligenceDispatchSchedules({ request });
    return NextResponse.json({
      schedules,
      count: schedules.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown schedule list error."
      },
      { status: 500 }
    );
  }
}

export async function POST(request: Request) {
  return upsertSchedule(request);
}

export async function PUT(request: Request) {
  return upsertSchedule(request);
}

export async function DELETE(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      scheduleId?: string;
      expectedVersion?: number;
    };
    if (!body.scheduleId) {
      return NextResponse.json({ error: "Missing scheduleId." }, { status: 400 });
    }

    await deleteIntelligenceDispatchSchedule(body.scheduleId, {
      request,
      expectedVersion:
        typeof body.expectedVersion === "number" ? body.expectedVersion : undefined
    });
    await recordAdminAuditEvent({
      request,
      action: "intelligence.schedule.delete",
      entity: "intelligence-schedule",
      entityId: body.scheduleId
    });

    return NextResponse.json({ deleted: true, scheduleId: body.scheduleId });
  } catch (error) {
    if (
      error instanceof Error &&
      typeof error.message === "string" &&
      error.message.startsWith("schedule-version-conflict:")
    ) {
      const currentVersion = Number.parseInt(error.message.split(":")[1] ?? "0", 10);
      return NextResponse.json(
        {
          error: "Schedule version conflict.",
          code: "schedule-version-conflict",
          currentVersion: Number.isFinite(currentVersion) ? currentVersion : 0
        },
        { status: 409 }
      );
    }

    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown schedule delete error."
      },
      { status: 400 }
    );
  }
}
