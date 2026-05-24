import type { ThemeBundle, ThemeTokens } from "@universal-admin/theming";
import type { DashboardConfig } from "@universal-admin/core";

export interface TenantRecord {
  id: string;
  slug: string;
  name: string;
  status: "ACTIVE" | "SUSPENDED" | "PROVISIONING";
}

export interface TenantConfigRecord {
  tenantId: string;
  dashboardConfig: DashboardConfig;
  authProvider: string;
  authConfig: Record<string, unknown>;
  businessProfile: string;
}

export interface TenantThemeRecord {
  tenantId: string;
  tokens: ThemeTokens;
  logoUrl: string | null;
  faviconUrl: string | null;
  darkMode: boolean;
}

export interface TenantDomainRecord {
  tenantId: string;
  domain: string;
  verified: boolean;
  isPrimary: boolean;
  accessStrategy?: "DOMAIN" | "API_ALIAS" | "BOTH";
}

export interface TenantResolver {
  resolveByDomain(hostname: string): Promise<TenantRecord | null>;
  resolveBySlug(slug: string): Promise<TenantRecord | null>;
  resolveById(id: string): Promise<TenantRecord | null>;
}

export interface TenantConfigLoader {
  loadConfig(tenantId: string): Promise<TenantConfigRecord | null>;
  loadTheme(tenantId: string): Promise<TenantThemeRecord | null>;
  loadDomains(tenantId: string): Promise<TenantDomainRecord[]>;
}

interface LruEntry<T> {
  value: T;
  expiresAt: number;
}

class LruCache<T> {
  private cache = new Map<string, LruEntry<T>>();
  private readonly maxSize: number;
  private readonly ttlMs: number;

  constructor(maxSize = 256, ttlMs = 60_000) {
    this.maxSize = maxSize;
    this.ttlMs = ttlMs;
  }

  get(key: string): T | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.cache.delete(key);
      return undefined;
    }
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T): void {
    if (this.cache.size >= this.maxSize) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) this.cache.delete(firstKey);
    }
    this.cache.set(key, { value, expiresAt: Date.now() + this.ttlMs });
  }

  invalidate(key: string): void {
    this.cache.delete(key);
  }
}

export interface TenantStoreDelegate {
  findTenantByDomain(domain: string): Promise<(TenantRecord & { domainVerified: boolean }) | null>;
  findTenantBySlug(slug: string): Promise<TenantRecord | null>;
  findTenantById(id: string): Promise<TenantRecord | null>;
  findConfig(tenantId: string): Promise<TenantConfigRecord | null>;
  findTheme(tenantId: string): Promise<TenantThemeRecord | null>;
  findDomains(tenantId: string): Promise<TenantDomainRecord[]>;
}

export function createTenantResolver(
  store: TenantStoreDelegate,
  options: { cacheTtlMs?: number; cacheSize?: number } = {}
): TenantResolver & TenantConfigLoader {
  const domainCache = new LruCache<TenantRecord | null>(
    options.cacheSize ?? 512,
    options.cacheTtlMs ?? 30_000
  );
  const slugCache = new LruCache<TenantRecord | null>(
    options.cacheSize ?? 512,
    options.cacheTtlMs ?? 30_000
  );
  const configCache = new LruCache<TenantConfigRecord | null>(
    options.cacheSize ?? 256,
    options.cacheTtlMs ?? 60_000
  );
  const themeCache = new LruCache<TenantThemeRecord | null>(
    options.cacheSize ?? 256,
    options.cacheTtlMs ?? 60_000
  );

  return {
    async resolveByDomain(hostname: string): Promise<TenantRecord | null> {
      const normalizedHost = hostname.toLowerCase().replace(/:\d+$/, "");
      const cached = domainCache.get(normalizedHost);
      if (cached !== undefined) return cached;

      const result = await store.findTenantByDomain(normalizedHost);
      if (!result || !result.domainVerified || result.status !== "ACTIVE") {
        domainCache.set(normalizedHost, null);
        return null;
      }

      const tenant: TenantRecord = {
        id: result.id,
        slug: result.slug,
        name: result.name,
        status: result.status
      };
      domainCache.set(normalizedHost, tenant);
      return tenant;
    },

    async resolveBySlug(slug: string): Promise<TenantRecord | null> {
      const cached = slugCache.get(slug);
      if (cached !== undefined) return cached;

      const result = await store.findTenantBySlug(slug);
      if (!result || result.status !== "ACTIVE") {
        slugCache.set(slug, null);
        return null;
      }
      slugCache.set(slug, result);
      return result;
    },

    async resolveById(id: string): Promise<TenantRecord | null> {
      const result = await store.findTenantById(id);
      if (!result || result.status !== "ACTIVE") {
        return null;
      }
      return result;
    },

    async loadConfig(tenantId: string): Promise<TenantConfigRecord | null> {
      const cached = configCache.get(tenantId);
      if (cached !== undefined) return cached;

      const result = await store.findConfig(tenantId);
      configCache.set(tenantId, result);
      return result;
    },

    async loadTheme(tenantId: string): Promise<TenantThemeRecord | null> {
      const cached = themeCache.get(tenantId);
      if (cached !== undefined) return cached;

      const result = await store.findTheme(tenantId);
      themeCache.set(tenantId, result);
      return result;
    },

    async loadDomains(tenantId: string): Promise<TenantDomainRecord[]> {
      return store.findDomains(tenantId);
    }
  };
}
