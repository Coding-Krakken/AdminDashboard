import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  getUserDashboardLayout,
  recordAdminAuditEvent,
  updateUserDashboardLayout
} from "@/platform/runtime";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const layout = await getUserDashboardLayout({ request });
    return NextResponse.json(layout);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown dashboard layout read error."
      },
      { status: 500 }
    );
  }
}

export async function PUT(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "settings:write"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const body = (await request.json()) as {
      profileId?: string;
      widgets?: string[];
      columns?: number;
    };

    const before = await getUserDashboardLayout({ request });
    const updated = await updateUserDashboardLayout(body, { request });

    await recordAdminAuditEvent({
      request,
      action: "layout.update",
      entity: "dashboard-layout",
      entityId: updated.userId,
      metadata: {
        profileId: updated.profileId,
        widgets: updated.widgets,
        columns: updated.columns,
        before,
        after: updated
      }
    });

    return NextResponse.json(updated);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown dashboard layout update error."
      },
      { status: 400 }
    );
  }
}
