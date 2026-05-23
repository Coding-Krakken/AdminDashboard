import { buildLayeredFlagMap } from "./flags";
import { hasPermission } from "./policy";
import { SettingsRegistry } from "./settings";
import type { DashboardConfig, FlagContext, Permission, Role } from "./types";
import { resolveDashboardConfig, type DashboardConfigSource } from "./config-resolver";

export interface DashboardUser {
  id: string;
  email: string;
  role: Role;
  tenantId?: string;
  permissions: Permission[];
}

export interface DashboardAuthAdapter {
  getCurrentUser(): Promise<DashboardUser | null>;
}

export interface DashboardBuildContext {
  role?: Role;
  tenantId?: string;
  userId?: string;
  permissions?: Permission[];
}

export interface DashboardModel {
  user: DashboardUser | null;
  policy: {
    role: Role;
    permissions: Permission[];
  };
  enabledFlags: Record<string, boolean>;
  modules: DashboardConfig["modules"];
  shell: {
    activeRoute: string;
    primaryNavigation: Array<{
      id: string;
      label: string;
      route: string;
      category?: DashboardConfig["modules"][number]["category"];
      icon?: string;
    }>;
    groupedNavigation: Record<
      string,
      Array<{
        id: string;
        label: string;
        route: string;
        category?: DashboardConfig["modules"][number]["category"];
        icon?: string;
      }>
    >;
  };
}

export interface DashboardOptions {
  config: DashboardConfigSource;
  authAdapter?: DashboardAuthAdapter;
  defaultContext?: DashboardBuildContext;
  fallbackRole?: Role;
}

export interface BuildDashboardModelOptions {
  context?: DashboardBuildContext;
  activeRoute?: string;
}

export interface Dashboard {
  getConfig(): DashboardConfig;
  resolveFlagMap(context?: DashboardBuildContext): Record<string, boolean>;
  buildModel(options?: BuildDashboardModelOptions): Promise<DashboardModel>;
  getSettingsRegistry(): SettingsRegistry;
  canAccess(permission: Permission, context?: DashboardBuildContext): boolean;
}

export async function createDashboard(options: DashboardOptions): Promise<Dashboard> {
  const config = await resolveDashboardConfig(options.config);
  const settingsRegistry = new SettingsRegistry();
  const fallbackRole = options.fallbackRole ?? "viewer";

  return {
    getConfig() {
      return config;
    },

    resolveFlagMap(context?: DashboardBuildContext) {
      const effectiveContext = resolveContext({
        inputContext: context,
        defaultContext: options.defaultContext,
        fallbackRole
      });

      const allFlagKeys = collectFlagKeys(config);
      return buildLayeredFlagMap(allFlagKeys, config.flags, {
        role: effectiveContext.role,
        tenantId: effectiveContext.tenantId,
        userId: effectiveContext.userId
      });
    },

    async buildModel(modelOptions: BuildDashboardModelOptions = {}) {
      const user = options.authAdapter ? await options.authAdapter.getCurrentUser() : null;
      const effectiveContext = resolveContext({
        inputContext: modelOptions.context,
        defaultContext: options.defaultContext,
        user,
        fallbackRole
      });

      const enabledFlags = buildLayeredFlagMap(collectFlagKeys(config), config.flags, {
        role: effectiveContext.role,
        tenantId: effectiveContext.tenantId,
        userId: effectiveContext.userId
      });

      const accessibleModules = config.modules.filter((module) => {
        const requiredPermissions = module.requiredPermissions ?? [];
        const requiredFlags = module.requiredFlags ?? [];
        const hasRequiredPermissions = requiredPermissions.every((permission) =>
          effectiveContext.permissions.includes(permission) ||
          effectiveContext.permissions.includes("*:*")
        );
        const hasRequiredFlags = requiredFlags.every((key) => enabledFlags[key] !== false);
        return hasRequiredPermissions && hasRequiredFlags;
      });

      const sortedModules = [...accessibleModules].sort((left, right) => {
        const leftOrder = left.order ?? Number.MAX_SAFE_INTEGER;
        const rightOrder = right.order ?? Number.MAX_SAFE_INTEGER;
        if (leftOrder !== rightOrder) {
          return leftOrder - rightOrder;
        }

        return left.id.localeCompare(right.id);
      });

      const navigation = sortedModules.map((module) => ({
        id: module.id,
        label: module.title,
        route: module.route,
        category: module.category,
        icon: module.icon
      }));

      const groupedNavigation = navigation.reduce<DashboardModel["shell"]["groupedNavigation"]>(
        (acc, item) => {
          const category = item.category ?? "uncategorized";
          if (!acc[category]) {
            acc[category] = [];
          }

          acc[category].push(item);
          return acc;
        },
        {}
      );

      return {
        user,
        policy: {
          role: effectiveContext.role,
          permissions: effectiveContext.permissions
        },
        enabledFlags,
        modules: sortedModules,
        shell: {
          activeRoute: modelOptions.activeRoute ?? "/",
          primaryNavigation: navigation,
          groupedNavigation
        }
      };
    },

    getSettingsRegistry() {
      return settingsRegistry;
    },

    canAccess(permission: Permission, context?: DashboardBuildContext) {
      const effectiveContext = resolveContext({
        inputContext: context,
        defaultContext: options.defaultContext,
        fallbackRole
      });
      return hasPermission(
        {
          role: effectiveContext.role,
          permissions: effectiveContext.permissions
        },
        permission
      );
    }
  };
}

function collectFlagKeys(config: DashboardConfig): string[] {
  const keys = new Set<string>();

  for (const module of config.modules) {
    for (const requiredFlag of module.requiredFlags ?? []) {
      keys.add(requiredFlag);
    }
  }

  for (const layer of [config.flags.global, config.flags.tenant, config.flags.role, config.flags.user]) {
    for (const rule of layer ?? []) {
      keys.add(rule.key);
    }
  }

  return [...keys];
}

function resolveContext(options: {
  inputContext?: DashboardBuildContext;
  defaultContext?: DashboardBuildContext;
  user?: DashboardUser | null;
  fallbackRole: Role;
}): Required<FlagContext> & { permissions: Permission[] } {
  const input = options.inputContext ?? {};
  const defaults = options.defaultContext ?? {};

  const role =
    input.role ?? options.user?.role ?? defaults.role ?? options.fallbackRole;
  const tenantId =
    input.tenantId ?? options.user?.tenantId ?? defaults.tenantId ?? "";
  const userId = input.userId ?? options.user?.id ?? defaults.userId ?? "";

  const permissions =
    input.permissions ??
    options.user?.permissions ??
    defaults.permissions ??
    [];

  return {
    role,
    tenantId,
    userId,
    permissions
  };
}
