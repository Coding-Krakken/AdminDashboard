import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    tenantDomain: {
      findFirst: vi.fn(),
      delete: vi.fn()
    }
  };

  return {
    prisma,
    enforcePlatformAccess: vi.fn(),
    removeCustomDomain: vi.fn()
  };
});

vi.mock("@/platform/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/platform/platform-auth", () => ({
  enforcePlatformAccess: mocks.enforcePlatformAccess
}));

vi.mock("@/platform/domain-manager", () => ({
  removeCustomDomain: mocks.removeCustomDomain
}));

import { DELETE } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants/tenant-1/domains/domain-1", {
    method: "DELETE"
  });
}

const params = Promise.resolve({ id: "tenant-1", domainId: "domain-1" });

describe("platform tenant domain delete route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePlatformAccess.mockReturnValue(null);
  });

  it("returns blocked response when guard fails", async () => {
    mocks.enforcePlatformAccess.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await DELETE(makeRequest(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when domain does not exist", async () => {
    mocks.prisma.tenantDomain.findFirst.mockResolvedValue(null);

    const response = await DELETE(makeRequest(), { params });

    expect(response.status).toBe(404);
  });

  it("removes domain from provider and store", async () => {
    mocks.prisma.tenantDomain.findFirst.mockResolvedValue({
      id: "domain-1",
      domain: "alpha.example.com",
      tenantId: "tenant-1"
    });

    const response = await DELETE(makeRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.deleted).toBe(true);
    expect(mocks.removeCustomDomain).toHaveBeenCalledWith("alpha.example.com");
    expect(mocks.prisma.tenantDomain.delete).toHaveBeenCalledWith({
      where: { id: "domain-1" }
    });
  });
});
