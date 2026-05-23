import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { getProfileCatalog } from "@/platform/runtime";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "profiles:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    return NextResponse.json({
      profiles: getProfileCatalog()
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Unknown profiles list error."
      },
      { status: 500 }
    );
  }
}
