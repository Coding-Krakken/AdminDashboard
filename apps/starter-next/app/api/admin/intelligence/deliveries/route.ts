import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { listIntelligenceAlertDeliveries } from "@/platform/runtime";

function normalizeLimit(value: string | null): number {
  const parsed = Number.parseInt(value ?? "50", 10);
  if (!Number.isFinite(parsed)) {
    return 50;
  }

  return Math.max(1, Math.min(parsed, 200));
}

function parseStatus(
  value: string | null
): "delivered" | "failed" | "skipped" | undefined {
  if (value === "delivered" || value === "failed" || value === "skipped") {
    return value;
  }

  return undefined;
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
    const url = new URL(request.url);
    const deliveries = await listIntelligenceAlertDeliveries({
      request,
      limit: normalizeLimit(url.searchParams.get("limit")),
      policyId: url.searchParams.get("policyId") ?? undefined,
      windowToken: url.searchParams.get("windowToken") ?? undefined,
      status: parseStatus(url.searchParams.get("status"))
    });

    return NextResponse.json({
      deliveries,
      count: deliveries.length
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown intelligence delivery list error."
      },
      { status: 500 }
    );
  }
}
