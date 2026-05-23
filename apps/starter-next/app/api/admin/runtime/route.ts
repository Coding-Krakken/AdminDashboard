import { NextResponse } from "next/server";
import { authorizeAdminApiRequest } from "@/platform/admin-api-policy";
import { buildDashboardModel, getRuntimeHealth } from "@/platform/runtime";

export async function GET(request: Request) {
  const authz = await authorizeAdminApiRequest({
    request,
    action: "runtime:read"
  });
  if (!authz.ok) {
    return authz.response;
  }

  try {
    const url = new URL(request.url);
    const profile = url.searchParams.get("profile") ?? undefined;

    const model = await buildDashboardModel({
      profileOverride: profile,
      request
    });
    const health = await getRuntimeHealth({ request });

    return NextResponse.json({
      user: model.user,
      profile: model.profile,
      modules: model.modules.map((module) => module.id),
      moduleCatalog: model.moduleCatalog,
      userLayout: model.userLayout,
      pluginCounts: model.pluginCounts,
      pluginExecutionPlan: model.pluginExecutionPlan,
      pluginCompatibility: model.pluginCompatibility,
      pluginRollout: model.pluginCompatibility.map((plugin) => ({
        pluginId: plugin.pluginId,
        stage: plugin.rolloutStage ?? "enabled",
        enabled: plugin.rolloutEnabled ?? true,
        reason: plugin.rolloutReason ?? "No rollout policy configured."
      })),
      pluginRolloutSummary: model.pluginRolloutSummary,
      security: model.security,
      flags: model.enabledFlags,
      health
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Unknown runtime summary error."
      },
      { status: 500 }
    );
  }
}
