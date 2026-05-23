import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import {
  getSettingsSchemaCatalogEntry,
  listSettingsSchemaCatalog
} from "@/platform/settings";

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
    const moduleId = url.searchParams.get("moduleId");

    if (moduleId) {
      const entry = await getSettingsSchemaCatalogEntry(moduleId);
      if (!entry) {
        return NextResponse.json(
          { error: `Unknown settings schema for '${moduleId}'.` },
          { status: 404 }
        );
      }

      return NextResponse.json(entry);
    }

    const schemas = await listSettingsSchemaCatalog();
    return NextResponse.json({ schemas });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unknown settings schema catalog error."
      },
      { status: 500 }
    );
  }
}
