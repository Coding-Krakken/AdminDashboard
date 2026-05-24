import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    tenantDomain: {
      findFirst: vi.fn(),
      update: vi.fn()
    }
  };

  return {
    prisma,
    enforcePlatformAccess: vi.fn(),
    verifyCustomDomain: vi.fn()
  };
});

vi.mock("@/platform/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/platform/platform-auth", () => ({
  enforcePlatformAccess: mocks.enforcePlatformAccess
}));

vi.mock("@/platform/domain-manager", () => ({
  verifyCustomDomain: mocks.verifyCustomDomain
}));

import { POST } from "../route";

function makeRequest(): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants/tenant-1/domains/domain-1/verify", {
    method: "POST"
  });
}

const params = Promise.resolve({ id: "tenant-1", domainId: "domain-1" });

describe("platform tenant domain verify route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePlatformAccess.mockReturnValue(null);
  });

  it("returns blocked response when guard fails", async () => {
    mocks.enforcePlatformAccess.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await POST(makeRequest(), { params });

    expect(response.status).toBe(401);
  });

  it("returns 404 when domain does not exist", async () => {
    mocks.prisma.tenantDomain.findFirst.mockResolvedValue(null);

    const response = await POST(makeRequest(), { params });

    expect(response.status).toBe(404);
  });

  it("returns verified response when verification succeeds", async () => {
    mocks.prisma.tenantDomain.findFirst.mockResolvedValue({
      id: "domain-1",
      domain: "alpha.example.com",
      tenantId: "tenant-1"
    });
    mocks.verifyCustomDomain.mockResolvedValue({
      verified: true,
      verification: { type: "cname", value: "cname.vercel-dns.com" }
    });
    mocks.prisma.tenantDomain.update.mockResolvedValue({
      id: "domain-1",
      domain: "alpha.example.com",
      verified: true
    });

    const response = await POST(makeRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.verified).toBe(true);
    expect(payload.message).toBe("Domain verified");
    expect(mocks.prisma.tenantDomain.update).toHaveBeenCalledWith({
      where: { id: "domain-1" },
      data: { verified: true }
    });
  });

  it("returns pending message when verification is not complete", async () => {
    mocks.prisma.tenantDomain.findFirst.mockResolvedValue({
      id: "domain-1",
      domain: "alpha.example.com",
      tenantId: "tenant-1"
    });
    mocks.verifyCustomDomain.mockResolvedValue({
      verified: false,
      verification: { type: "txt", value: "verify-token" }
    });
    mocks.prisma.tenantDomain.update.mockResolvedValue({
      id: "domain-1",
      domain: "alpha.example.com",
      verified: false
    });

    const response = await POST(makeRequest(), { params });
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.verified).toBe(false);
    expect(payload.message).toBe("Domain verification pending");
  });
});
