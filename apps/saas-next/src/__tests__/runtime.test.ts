import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const adapterGetCurrentUser = vi.fn();
  return {
    resolveByDomain: vi.fn(),
    resolveById: vi.fn(),
    loadTenantRuntimeConfig: vi.fn(),
    loadTenantPresentationConfig: vi.fn(),
    extractUserFromRequestHeaders: vi.fn(),
    adapterGetCurrentUser,
    createDynamicAuthAdapter: vi.fn(() => ({
      getCurrentUser: adapterGetCurrentUser
    }))
  };
});

vi.mock("@/platform/db", () => ({
  prisma: {}
}));

vi.mock("@/platform/tenant-store", () => ({
  createPrismaTenantStore: vi.fn(() => ({}))
}));

vi.mock("@universal-admin/adapters", () => ({
  createTenantResolver: vi.fn(() => ({
    resolveByDomain: mocks.resolveByDomain,
    resolveById: mocks.resolveById
  })),
  loadTenantRuntimeConfig: mocks.loadTenantRuntimeConfig,
  loadTenantPresentationConfig: mocks.loadTenantPresentationConfig,
  extractUserFromRequestHeaders: mocks.extractUserFromRequestHeaders,
  createDynamicAuthAdapter: mocks.createDynamicAuthAdapter,
  createPrismaKeyValueDataAdapter: vi.fn()
}));

import { createRequestFromHeaderEntries, resolveTenantFromRequest } from "../platform/runtime";

describe("saas runtime tenant auth resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mocks.resolveByDomain.mockResolvedValue({
      id: "tenant-1",
      slug: "alpha",
      name: "Alpha",
      status: "ACTIVE"
    });
    mocks.resolveById.mockResolvedValue({
      id: "tenant-1",
      slug: "alpha",
      name: "Alpha",
      status: "ACTIVE"
    });

    mocks.loadTenantRuntimeConfig.mockResolvedValue({
      dashboardConfig: {
        modules: [],
        flags: { global: [], tenant: [], role: [], user: [] },
        rolePermissions: {
          admin: ["dashboard:read", "settings:write"],
          viewer: ["dashboard:read"]
        }
      },
      authProvider: "platform",
      authConfig: {},
      businessProfile: "generic"
    });

    mocks.loadTenantPresentationConfig.mockResolvedValue({
      themeBundle: { tenant: {} },
      logoUrl: null,
      faviconUrl: null,
      darkMode: true
    });

    mocks.extractUserFromRequestHeaders.mockReturnValue(null);
    mocks.adapterGetCurrentUser.mockResolvedValue(null);
  });

  it("prefers header user and skips adapter fetch", async () => {
    const headerUser = {
      id: "user-header",
      email: "header@example.com",
      role: "admin",
      tenantId: "tenant-1",
      permissions: ["dashboard:read"]
    };

    mocks.extractUserFromRequestHeaders.mockReturnValue(headerUser);

    const request = createRequestFromHeaderEntries([["host", "alpha.example.com"]]);
    const tenantCtx = await resolveTenantFromRequest(request);

    expect(tenantCtx?.user).toEqual(headerUser);
    expect(mocks.adapterGetCurrentUser).not.toHaveBeenCalled();
  });

  it("uses dynamic adapter user when header user is missing", async () => {
    const adapterUser = {
      id: "user-adapter",
      email: "adapter@example.com",
      role: "viewer",
      tenantId: "tenant-1",
      permissions: ["dashboard:read"]
    };

    mocks.adapterGetCurrentUser.mockResolvedValue(adapterUser);

    const request = createRequestFromHeaderEntries([["host", "alpha.example.com"]]);
    const tenantCtx = await resolveTenantFromRequest(request);

    expect(tenantCtx?.user).toEqual(adapterUser);
    expect(mocks.adapterGetCurrentUser).toHaveBeenCalledTimes(1);
  });

  it("falls back to anonymous user when no header or adapter user exists", async () => {
    const request = createRequestFromHeaderEntries([["host", "alpha.example.com"]]);
    const tenantCtx = await resolveTenantFromRequest(request);

    expect(tenantCtx?.user.id).toBe("anonymous");
    expect(tenantCtx?.user.role).toBe("viewer");
    expect(tenantCtx?.user.tenantId).toBe("tenant-1");
    expect(tenantCtx?.user.permissions).toEqual(["dashboard:read"]);
  });

  it("normalizes unsupported auth providers to platform", async () => {
    mocks.loadTenantRuntimeConfig.mockResolvedValue({
      dashboardConfig: {
        modules: [],
        flags: { global: [], tenant: [], role: [], user: [] },
        rolePermissions: {}
      },
      authProvider: "custom-auth",
      authConfig: {},
      businessProfile: "generic"
    });

    const request = createRequestFromHeaderEntries([["host", "alpha.example.com"]]);
    await resolveTenantFromRequest(request);

    expect(mocks.createDynamicAuthAdapter).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "platform" }),
      "tenant-1"
    );
  });

  it("resolves tenant by x-tenant-id when alias header is present", async () => {
    const request = createRequestFromHeaderEntries([
      ["host", "admin-dashboard.vercel.app"],
      ["x-tenant-id", "tenant-1"]
    ]);

    const tenantCtx = await resolveTenantFromRequest(request);

    expect(tenantCtx?.tenant.id).toBe("tenant-1");
    expect(mocks.resolveById).toHaveBeenCalledWith("tenant-1");
    expect(mocks.resolveByDomain).not.toHaveBeenCalled();
  });
});
