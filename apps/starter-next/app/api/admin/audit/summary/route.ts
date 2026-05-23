import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { summarizeAuditEvents } from "@/platform/runtime";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "audit:summary:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action") ?? undefined;
  const entity = url.searchParams.get("entity") ?? undefined;
  const entityId = url.searchParams.get("entityId") ?? undefined;
  const actorId = url.searchParams.get("actorId") ?? undefined;
  const deniedOnly = url.searchParams.get("deniedOnly") === "true";
  const since = url.searchParams.get("since") ?? undefined;
  const until = url.searchParams.get("until") ?? undefined;

  const sinceTs = since ? Date.parse(since) : Number.NaN;
  const untilTs = until ? Date.parse(until) : Number.NaN;

  if (since && Number.isNaN(sinceTs)) {
    return NextResponse.json({ error: "Invalid since timestamp." }, { status: 400 });
  }

  if (until && Number.isNaN(untilTs)) {
    return NextResponse.json({ error: "Invalid until timestamp." }, { status: 400 });
  }

  if (!Number.isNaN(sinceTs) && !Number.isNaN(untilTs) && sinceTs > untilTs) {
    return NextResponse.json(
      { error: "Invalid range: since must be before until." },
      { status: 400 }
    );
  }

  try {
    const summary = await summarizeAuditEvents({
      action,
      entity,
      entityId,
      actorId,
      deniedOnly,
      since,
      until,
      request
    });

    return NextResponse.json(summary);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown audit summary error."
      },
      { status: 500 }
    );
  }
}
