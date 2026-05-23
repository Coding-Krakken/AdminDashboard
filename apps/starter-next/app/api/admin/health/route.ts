import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { getRuntimeHealth } from "@/platform/runtime";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "health:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const health = await getRuntimeHealth({ request });

    return NextResponse.json(health, {
      status: health.status === "healthy" ? 200 : 503
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown health check error."
      },
      { status: 500 }
    );
  }
}
