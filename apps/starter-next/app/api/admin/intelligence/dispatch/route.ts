import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  buildIntelligenceDispatchSnapshot,
  normalizeIntelligenceWindowDays
} from "@/platform/intelligence-runtime";
import {
  dispatchIntelligenceAlerts,
  recordAdminAuditEvent
} from "@/platform/runtime";

export async function POST(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      profile?: string;
      windowDays?: number | string;
      windowToken?: string;
    };

    const profile = typeof body.profile === "string" ? body.profile : undefined;
    const windowDays = normalizeIntelligenceWindowDays(body.windowDays);

    const snapshot = await buildIntelligenceDispatchSnapshot({
      request,
      profile,
      windowDays
    }).catch((error) => {
      if (error instanceof Error && error.message === "audit-access-required") {
        return null;
      }

      throw error;
    });

    if (!snapshot) {
      return NextResponse.json(
        { error: "Audit access is required to dispatch intelligence alerts." },
        { status: 403 }
      );
    }

    const { runtime, windowStartIso, alerts } = snapshot;

    const nowIso = new Date().toISOString();
    const windowToken =
      typeof body.windowToken === "string" && body.windowToken.length > 0
        ? body.windowToken
        : `${runtime.profile.id}:${windowDays}:${windowStartIso.slice(0, 10)}`;

    const deliveries = await dispatchIntelligenceAlerts(alerts, {
      request,
      profileId: runtime.profile.id,
      windowToken,
      generatedAt: nowIso
    });

    await recordAdminAuditEvent({
      request,
      action: "intelligence.dispatch",
      entity: "intelligence-alert",
      entityId: windowToken,
      metadata: {
        profileId: runtime.profile.id,
        windowDays,
        alertCount: alerts.length,
        deliveryCount: deliveries.length,
        deliveredCount: deliveries.filter((item) => item.status === "delivered").length,
        failedCount: deliveries.filter((item) => item.status === "failed").length,
        skippedCount: deliveries.filter((item) => item.status === "skipped").length
      }
    });

    return NextResponse.json({
      profileId: runtime.profile.id,
      windowDays,
      windowToken,
      alerts,
      deliveries
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence dispatch error."
      },
      { status: 500 }
    );
  }
}
