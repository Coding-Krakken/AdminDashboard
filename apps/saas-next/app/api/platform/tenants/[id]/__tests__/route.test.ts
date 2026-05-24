import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const tx = {
    tenant: {
      update: vi.fn(),
      findUnique: vi.fn()
    },
    tenantConfig: {
      update: vi.fn()
    },
    tenantTheme: {
      update: vi.fn()
    }
  };

  const prisma = {
    tenant: {
      findUnique: vi.fn(),
      delete: vi.fn()
    },
    $transaction: vi.fn(),
    __tx: tx
  };

  return {
    prisma,
    enforcePlatformAccess: vi.fn(),
    removeCustomDomain: vi.fn()
  };
});

vi.mock("@/platform/db", () => ({
  prisma: {
    tenant: mocks.prisma.tenant,
    $transaction: mocks.prisma.$transaction
  }
}));

vi.mock("@/platform/platform-auth", () => ({
  enforcePlatformAccess: mocks.enforcePlatformAccess
}));

vi.mock("@/platform/domain-manager", () => ({
  removeCustomDomain: mocks.removeCustomDomain
}));

import { DELETE, GET, PATCH } from "../route";

function makeRequest(method: "GET" | "PATCH" | "DELETE", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants/tenant-1", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

const params = Promise.resolve({ id: "tenant-1" });

describe("platform tenant by id route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePlatformAccess.mockReturnValue(null);
  });

  it("returns 404 when patch target tenant does not exist", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), { params });

    expect(response.status).toBe(404);
  });

  it("returns blocked response for tenant GET when guard fails", async () => {
    mocks.enforcePlatformAccess.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 for tenant GET when tenant does not exist", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(404);
  });

  it("returns tenant payload for tenant GET", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      slug: "alpha",
      name: "Alpha",
      config: {},
      theme: {},
      domains: []
    });

    const response = await GET(makeRequest("GET"), { params });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tenant.id).toBe("tenant-1");
    expect(mocks.prisma.tenant.findUnique).toHaveBeenCalledWith({
      where: { id: "tenant-1" },
      include: { config: true, theme: true, domains: true }
    });
  });

  it("updates tenant via transaction and returns payload", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma.__tx) => Promise<unknown>) => {
      mocks.prisma.__tx.tenant.findUnique.mockResolvedValue({ id: "tenant-1", name: "Updated", domains: [] });
      return fn(mocks.prisma.__tx);
    });

    const response = await PATCH(
      makeRequest("PATCH", {
        name: "Updated",
        authProvider: "platform",
        authConfig: { region: "us" },
        dashboardConfig: { modules: [] },
        theme: { darkMode: true }
      }),
      { params }
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tenant.name).toBe("Updated");
    expect(mocks.prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(mocks.prisma.__tx.tenantConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1" },
        data: expect.objectContaining({
          authProvider: "platform"
        })
      })
    );
  });

  it("updates preferredAccessStrategy on tenant config", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.$transaction.mockImplementation(async (fn: (tx: typeof mocks.prisma.__tx) => Promise<unknown>) => {
      mocks.prisma.__tx.tenant.findUnique.mockResolvedValue({ id: "tenant-1", name: "Updated", domains: [] });
      return fn(mocks.prisma.__tx);
    });

    const response = await PATCH(
      makeRequest("PATCH", {
        preferredAccessStrategy: "API_ALIAS"
      }),
      { params }
    );

    expect(response.status).toBe(200);
    expect(mocks.prisma.__tx.tenantConfig.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { tenantId: "tenant-1" },
        data: expect.objectContaining({
          preferredAccessStrategy: "API_ALIAS"
        })
      })
    );
  });

  it("returns 404 when delete target tenant does not exist", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const response = await DELETE(makeRequest("DELETE"), { params });

    expect(response.status).toBe(404);
  });

  it("deletes tenant after domain cleanup", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({
      id: "tenant-1",
      domains: [{ domain: "alpha.example.com" }, { domain: "beta.example.com" }]
    });

    const response = await DELETE(makeRequest("DELETE"), { params });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(mocks.removeCustomDomain).toHaveBeenCalledTimes(2);
    expect(mocks.prisma.tenant.delete).toHaveBeenCalledWith({ where: { id: "tenant-1" } });
  });
});
