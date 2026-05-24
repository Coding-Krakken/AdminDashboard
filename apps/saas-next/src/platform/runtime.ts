import {
  buildRuntimeDashboardModel,
  type DashboardConfig,
  type ModuleManifest,
  type Permission,
} from "@universal-admin/core";
import {
  type AuthUser,
  type TenantRecord,
  type TenantConfigRecord,
  type TenantThemeRecord,
  createDynamicAuthAdapter,
  createTenantResolver,
  extractUserFromRequestHeaders,
  loadTenantPresentationConfig,
  loadTenantRuntimeConfig,
  type TenantAuthConfig,
  createPrismaKeyValueDataAdapter,
  type PrismaLikeClient,
} from "@universal-admin/adapters";
import { resolveThemeTokens, toCssVariables, type ThemeBundle } from "@universal-admin/theming";
import { buildNavigation, buildShellModel, type NavigationItem } from "@universal-admin/ui";
import { prisma } from "./db";
import { createPrismaTenantStore } from "./tenant-store";

// --- Tenant resolver singleton ---

const tenantStore = createPrismaTenantStore(prisma);
const tenantService = createTenantResolver(tenantStore, {
  cacheTtlMs: 30_000,
  cacheSize: 512
});

// --- Public API ---

export interface TenantContext {
  tenant: TenantRecord;
  config: TenantConfigRecord;
  theme: TenantThemeRecord | null;
  user: AuthUser;
}

const DEFAULT_PERMISSIONS: Permission[] = ["dashboard:read"];
const SUPPORTED_AUTH_PROVIDERS = new Set<TenantAuthConfig["provider"]>([
  "clerk",
  "nextauth",
  "jwt",
  "platform",
  "anonymous"
]);

const DEFAULT_THEME_BASE: ThemeBundle["base"] = {
  "color-background": "hsl(222 47% 6%)",
  "color-foreground": "hsl(210 40% 98%)",
  "color-primary": "hsl(160 56% 55%)",
  "color-primary-foreground": "hsl(222 47% 6%)",
  "color-border": "hsl(215 28% 20%)",
  radius: "0.625rem"
};

export async function resolveTenantFromRequest(request: Request): Promise<TenantContext | null> {
  const hostname = request.headers.get("x-tenant-hostname")
    ?? request.headers.get("host")
    ?? "";

  const mode = request.headers.get("x-tenant-mode");

  if (mode === "platform") {
    return null; // Platform routes don't need tenant context
  }

  const tenant = await tenantService.resolveByDomain(hostname);
  if (!tenant) return null;

  const runtimeConfig = await loadTenantRuntimeConfig(tenantService, tenant.id);
  if (!runtimeConfig) {
    return null;
  }

  const presentationConfig = await loadTenantPresentationConfig(tenantService, tenant.id);

  const config: TenantConfigRecord = {
    tenantId: tenant.id,
    dashboardConfig: runtimeConfig.dashboardConfig,
    authProvider: runtimeConfig.authProvider,
    authConfig: runtimeConfig.authConfig,
    businessProfile: runtimeConfig.businessProfile
  };

  const theme: TenantThemeRecord = {
    tenantId: tenant.id,
    tokens: presentationConfig.themeBundle.tenant ?? {},
    logoUrl: presentationConfig.logoUrl,
    faviconUrl: presentationConfig.faviconUrl,
    darkMode: presentationConfig.darkMode
  };

  const authConfig = normalizeTenantAuthConfig(config);
  const adapter = createDynamicAuthAdapter(authConfig, tenant.id);

  const headerUser = extractUserFromRequestHeaders(request.headers, tenant.id, authConfig);
  const adapterUser = headerUser ? null : await adapter.getCurrentUser();

  const user = headerUser
    ?? adapterUser
    ?? {
      id: "anonymous",
      email: "anonymous@tenant",
      role: "viewer",
      tenantId: tenant.id,
      permissions: DEFAULT_PERMISSIONS
    };

  return { tenant, config, theme, user };
}

export function buildTenantThemeCss(theme: TenantThemeRecord | null): string {
  const bundle: ThemeBundle = {
    base: DEFAULT_THEME_BASE,
    tenant: theme?.tokens ?? {}
  };
  const tokens = resolveThemeTokens(bundle);
  return toCssVariables(tokens);
}

export interface TenantDashboardModel {
  modules: ModuleManifest[];
  navigation: NavigationItem[];
  enabledFlags: Record<string, boolean>;
  profile: { id: string; label: string };
  user: AuthUser;
  tenantName: string;
  tenantSlug: string;
}

export async function buildTenantDashboardModel(
  ctx: TenantContext
): Promise<TenantDashboardModel> {
  const { tenant, config, user } = ctx;
  const dashboardConfig = config.dashboardConfig as DashboardConfig;
  const permissions = resolveUserPermissions(dashboardConfig, user);

  const runtimeResult = await buildRuntimeDashboardModel<NavigationItem, { activeRoute: string }>(
    {
      config: dashboardConfig,
      user: {
        id: user.id,
        tenantId: tenant.id
      },
      policy: {
        role: user.role,
        permissions
      },
      staticPlugins: [],
      runtimePlugins: [],
      buildNavigation,
      buildShell: (navigation) => buildShellModel(navigation, "/")
    }
  );

  return {
    modules: runtimeResult.modules,
    navigation: runtimeResult.navigation,
    enabledFlags: runtimeResult.enabledFlags,
    profile: { id: config.businessProfile, label: config.businessProfile },
    user: {
      ...user,
      permissions
    },
    tenantName: tenant.name,
    tenantSlug: tenant.slug,
  };
}

// --- Data adapter for tenant-scoped runtime state ---

export function getTenantDataAdapter(tenantId: string) {
  return createPrismaKeyValueDataAdapter(prisma as unknown as PrismaLikeClient, {
    modelKey: "runtimeState",
    tenantId
  });
}

// --- Helpers ---

export function createRequestFromHeaderEntries(
  entries: Array<[string, string]>
): Request {
  const headers = new Headers();
  for (const [key, value] of entries) {
    headers.set(key, value);
  }
  return new Request("http://localhost", { headers });
}

export function headersToRecord(request: Request): Record<string, string> {
  const result: Record<string, string> = {};
  request.headers.forEach((value, key) => {
    result[key] = value;
  });
  return result;
}

function normalizeTenantAuthConfig(config: TenantConfigRecord): TenantAuthConfig {
  const rawProvider =
    typeof config.authProvider === "string" && config.authProvider.length > 0
      ? config.authProvider
      : "platform";

  const provider = SUPPORTED_AUTH_PROVIDERS.has(rawProvider as TenantAuthConfig["provider"])
    ? (rawProvider as TenantAuthConfig["provider"])
    : "platform";

  return {
    provider,
    ...(config.authConfig ?? {})
  } as TenantAuthConfig;
}

function resolveUserPermissions(config: DashboardConfig, user: AuthUser): Permission[] {
  const rolePermissions = config.rolePermissions?.[user.role] ?? [];
  if (user.permissions.length === 0) {
    return rolePermissions.length > 0 ? rolePermissions : DEFAULT_PERMISSIONS;
  }

  const unique = new Set<Permission>([...rolePermissions, ...user.permissions]);
  return Array.from(unique);
}
