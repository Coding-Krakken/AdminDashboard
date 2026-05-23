import { buildLayeredFlagMap } from "./flags";
import { PluginRuntime } from "./plugin-runtime";
import type {
  DashboardConfig,
  ModuleManifest,
  ModulePlugin,
  Permission,
  PluginCompatibilityReport,
  PluginRuntimeContext,
  PluginSecurityPolicy,
  UserPolicyContext
} from "./types";

export interface RuntimeBuilderUser {
  id: string;
  tenantId?: string;
}

export interface RuntimeBuilderPluginContext extends PluginRuntimeContext {
  tenantId?: string;
  userId?: string;
}

export interface RuntimeDashboardBuildOptions<NavigationItem, ShellModel> {
  config: DashboardConfig;
  user: RuntimeBuilderUser;
  policy: UserPolicyContext;
  staticPlugins: ModulePlugin[];
  runtimePlugins: ModulePlugin[];
  pluginSecurityPolicy?: PluginSecurityPolicy;
  applyFlags?: (flags: Record<string, boolean>) => Record<string, boolean>;
  filterModules?: (modules: ModuleManifest[]) => ModuleManifest[];
  buildNavigation: (
    modules: ModuleManifest[],
    policy: UserPolicyContext,
    enabledFlags: Record<string, boolean>
  ) => NavigationItem[];
  buildShell: (navigation: NavigationItem[]) => ShellModel;
}

export interface RuntimeDashboardBuildResult<NavigationItem, ShellModel> {
  context: RuntimeBuilderPluginContext;
  modules: ModuleManifest[];
  navigation: NavigationItem[];
  shell: ShellModel;
  enabledFlags: Record<string, boolean>;
  pluginCompatibility: PluginCompatibilityReport[];
  pluginExecutionPlan: string[];
  pluginCounts: {
    static: number;
    runtime: number;
  };
}

export async function buildRuntimeDashboardModel<NavigationItem, ShellModel>(
  options: RuntimeDashboardBuildOptions<NavigationItem, ShellModel>
): Promise<RuntimeDashboardBuildResult<NavigationItem, ShellModel>> {
  const runtime = new PluginRuntime(options.staticPlugins, {
    securityPolicy: options.pluginSecurityPolicy
  });

  for (const plugin of options.runtimePlugins) {
    runtime.registerPlugin(plugin, true);
  }

  const flagKeys = collectRequiredFlagKeys(options.config, options.runtimePlugins);
  const layeredFlags = buildLayeredFlagMap(flagKeys, options.config.flags, {
    role: options.policy.role,
    tenantId: options.user.tenantId,
    userId: options.user.id
  });

  const enabledFlags = options.applyFlags
    ? options.applyFlags(layeredFlags)
    : layeredFlags;

  const context: RuntimeBuilderPluginContext = {
    policy: options.policy,
    flags: enabledFlags,
    tenantId: options.user.tenantId,
    userId: options.user.id
  };

  await runtime.initialize(context);

  const accessibleModules = runtime.resolveAccessibleModules(options.policy, enabledFlags);
  const modules = options.filterModules
    ? options.filterModules(accessibleModules)
    : accessibleModules;

  const navigation = options.buildNavigation(modules, options.policy, enabledFlags);
  const shell = options.buildShell(navigation);

  return {
    context,
    modules,
    navigation,
    shell,
    enabledFlags,
    pluginCompatibility: runtime.getCompatibilityMatrix(context),
    pluginExecutionPlan: runtime.getContextualActivePluginExecutionPlan(context),
    pluginCounts: {
      static: options.staticPlugins.length,
      runtime: options.runtimePlugins.length
    }
  };
}

function collectRequiredFlagKeys(config: DashboardConfig, plugins: ModulePlugin[]): string[] {
  return Array.from(
    new Set([
      ...config.modules.flatMap((module) => module.requiredFlags ?? []),
      ...plugins.flatMap((plugin) => plugin.manifest.requiredFlags ?? []),
      ...(config.flags.global?.map((rule) => rule.key) ?? []),
      ...(config.flags.tenant?.map((rule) => rule.key) ?? []),
      ...(config.flags.role?.map((rule) => rule.key) ?? []),
      ...(config.flags.user?.map((rule) => rule.key) ?? [])
    ])
  );
}

export function canAccessPermission(
  policy: UserPolicyContext,
  permission: Permission
): boolean {
  return policy.permissions.includes("*:*") || policy.permissions.includes(permission);
}
