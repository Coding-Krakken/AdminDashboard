import type { DashboardConfig } from "@universal-admin/core";
import type { ThemeBundle } from "@universal-admin/theming";
import type { TenantConfigLoader, TenantConfigRecord, TenantThemeRecord } from "./tenant-resolver";

export interface TenantRuntimeConfig {
  dashboardConfig: DashboardConfig;
  authProvider: string;
  authConfig: Record<string, unknown>;
  businessProfile: string;
}

export interface TenantPresentationConfig {
  themeBundle: ThemeBundle;
  logoUrl: string | null;
  faviconUrl: string | null;
  darkMode: boolean;
}

export async function loadTenantRuntimeConfig(
  loader: TenantConfigLoader,
  tenantId: string
): Promise<TenantRuntimeConfig | null> {
  const config = await loader.loadConfig(tenantId);
  if (!config) {
    return null;
  }

  return {
    dashboardConfig: config.dashboardConfig,
    authProvider: config.authProvider,
    authConfig: config.authConfig,
    businessProfile: config.businessProfile
  };
}

export async function loadTenantPresentationConfig(
  loader: TenantConfigLoader,
  tenantId: string
): Promise<TenantPresentationConfig> {
  const theme = await loader.loadTheme(tenantId);
  return toPresentationConfig(theme);
}

export function toPresentationConfig(
  theme: TenantThemeRecord | null
): TenantPresentationConfig {
  return {
    themeBundle: {
      base: {},
      tenant: theme?.tokens ?? {}
    },
    logoUrl: theme?.logoUrl ?? null,
    faviconUrl: theme?.faviconUrl ?? null,
    darkMode: theme?.darkMode ?? true
  };
}
