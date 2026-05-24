import { describe, expect, it, vi } from "vitest";
import {
  createTenantResolver,
  type TenantStoreDelegate,
  type TenantRecord,
  type TenantConfigRecord,
  type TenantThemeRecord,
  type TenantDomainRecord
} from "../tenant-resolver";

function createMockStore(): TenantStoreDelegate {
  const tenant: TenantRecord = {
    id: "tenant-1",
    slug: "acme",
    name: "Acme",
    status: "ACTIVE"
  };

  const config: TenantConfigRecord = {
    tenantId: tenant.id,
    dashboardConfig: {
      modules: [],
      flags: {},
      rolePermissions: {}
    },
    authProvider: "platform",
    authConfig: {},
    businessProfile: "generic"
  };

  const theme: TenantThemeRecord = {
    tenantId: tenant.id,
    tokens: {
      "color-primary": "#00ff99"
    },
    logoUrl: null,
    faviconUrl: null,
    darkMode: true
  };

  const domains: TenantDomainRecord[] = [
    {
      tenantId: tenant.id,
      domain: "admin.acme.test",
      verified: true,
      isPrimary: true
    }
  ];

  return {
    findTenantByDomain: vi.fn(async (domain: string) => {
      if (domain !== "admin.acme.test") {
        return null;
      }
      return {
        ...tenant,
        domainVerified: true
      };
    }),
    findTenantBySlug: vi.fn(async (slug: string) => (slug === "acme" ? tenant : null)),
    findTenantById: vi.fn(async (id: string) => (id === tenant.id ? tenant : null)),
    findConfig: vi.fn(async (tenantId: string) => (tenantId === tenant.id ? config : null)),
    findTheme: vi.fn(async (tenantId: string) => (tenantId === tenant.id ? theme : null)),
    findDomains: vi.fn(async (tenantId: string) => (tenantId === tenant.id ? domains : []))
  };
}

describe("tenant-resolver", () => {
  it("resolves active tenant by domain", async () => {
    const store = createMockStore();
    const resolver = createTenantResolver(store);

    const tenant = await resolver.resolveByDomain("admin.acme.test");

    expect(tenant?.id).toBe("tenant-1");
    expect(tenant?.slug).toBe("acme");
  });

  it("caches domain lookups", async () => {
    const store = createMockStore();
    const resolver = createTenantResolver(store, { cacheTtlMs: 60_000 });

    await resolver.resolveByDomain("admin.acme.test");
    await resolver.resolveByDomain("admin.acme.test");

    expect(store.findTenantByDomain).toHaveBeenCalledTimes(1);
  });

  it("loads tenant config and theme", async () => {
    const store = createMockStore();
    const resolver = createTenantResolver(store);

    const config = await resolver.loadConfig("tenant-1");
    const theme = await resolver.loadTheme("tenant-1");

    expect(config?.authProvider).toBe("platform");
    expect(theme?.tokens["color-primary"]).toBe("#00ff99");
  });

  it("returns null for suspended tenant id resolution", async () => {
    const store = createMockStore();
    const resolver = createTenantResolver(store);

    vi.mocked(store.findTenantById).mockResolvedValueOnce({
      id: "tenant-suspended",
      slug: "suspended",
      name: "Suspended",
      status: "SUSPENDED"
    });

    const tenant = await resolver.resolveById("tenant-suspended");

    expect(tenant).toBeNull();
  });
});
