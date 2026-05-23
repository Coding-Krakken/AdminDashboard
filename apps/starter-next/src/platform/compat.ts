import { buildRuntimeDashboardModel } from "@universal-admin/core";
import type { Permission } from "@universal-admin/core";
import { buildNavigation, buildShellModel } from "@universal-admin/ui";
import { dashboardConfig, pluginSecurityPolicy } from "./config";
import type { BusinessProfile } from "./module-packs";
import { applyPackFlags, filterModulesByPack } from "./module-packs";
import { getRuntimePlugins, getStaticPlugins } from "./plugins";

export async function buildStarterRuntimeCompatibilityModel(options: {
  user: { id: string; tenantId?: string };
  policy: { role: string; permissions: Permission[] };
  profileId: BusinessProfile;
}) {
  const staticPlugins = getStaticPlugins(pluginSecurityPolicy.signingSecret ?? "");
  const runtimePlugins = await getRuntimePlugins();

  return buildRuntimeDashboardModel({
    config: dashboardConfig,
    user: options.user,
    policy: options.policy,
    staticPlugins,
    runtimePlugins,
    pluginSecurityPolicy,
    applyFlags: (flags) => applyPackFlags(flags, options.profileId),
    filterModules: (modules) => filterModulesByPack(modules, options.profileId),
    buildNavigation,
    buildShell: (navigation) => buildShellModel(navigation, "/")
  });
}
