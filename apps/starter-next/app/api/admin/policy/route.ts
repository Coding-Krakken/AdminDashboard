import { NextResponse } from "next/server";
import {
  authorizeAdminApiRequest,
  getAdminApiPolicy
} from "@/platform/admin-api-policy";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "policy:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  return NextResponse.json({
    policy: getAdminApiPolicy()
  });
}
