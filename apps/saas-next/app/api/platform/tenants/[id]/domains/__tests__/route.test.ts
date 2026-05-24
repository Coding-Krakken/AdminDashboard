import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    tenant: {
      findUnique: vi.fn()
    },
    tenantConfig: {
      update: vi.fn()
    },
    tenantDomain: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };

  return {
    prisma,
    enforcePlatformAccess: vi.fn(),
    addCustomDomain: vi.fn()
  };
});

vi.mock("@/platform/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/platform/platform-auth", () => ({
  enforcePlatformAccess: mocks.enforcePlatformAccess
}));

vi.mock("@/platform/domain-manager", () => ({
  addCustomDomain: mocks.addCustomDomain
}));

import { GET, POST } from "../route";

function makeRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants/tenant-1/domains", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

const params = Promise.resolve({ id: "tenant-1" });

describe("platform tenant domains route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePlatformAccess.mockReturnValue(null);
  });

  it("returns blocked response for unauthorized access", async () => {
    mocks.enforcePlatformAccess.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET(makeRequest("GET"), { params });

    expect(response.status).toBe(401);
  });

  it("returns 400 when domain payload is invalid", async () => {
    const response = await POST(makeRequest("POST", { domain: "not-a-domain" }), { params });

    expect(response.status).toBe(400);
  });

  it("returns 404 when tenant does not exist", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);

    const response = await POST(makeRequest("POST", { domain: "example.com" }), { params });

    expect(response.status).toBe(404);
  });

  it("returns 409 when domain is already registered", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.tenantDomain.findUnique.mockResolvedValue({ id: "domain-existing" });

    const response = await POST(makeRequest("POST", { domain: "example.com" }), { params });

    expect(response.status).toBe(409);
  });

  it("creates domain and normalizes domain casing", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });
    mocks.prisma.tenantDomain.findUnique.mockResolvedValue(null);
    mocks.addCustomDomain.mockResolvedValue({
      verified: false,
      vercelDomainId: "vercel-domain-1",
      verification: { type: "cname", value: "cname.vercel-dns.com" }
    });
    mocks.prisma.tenantDomain.create.mockResolvedValue({
      id: "domain-1",
      tenantId: "tenant-1",
      domain: "example.com",
      verified: false
    });

    const response = await POST(makeRequest("POST", { domain: "Example.COM" }), { params });
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.domain.domain).toBe("example.com");
    expect(mocks.prisma.tenantDomain.findUnique).toHaveBeenCalledWith({
      where: { domain: "example.com" }
    });
    expect(mocks.addCustomDomain).toHaveBeenCalledWith("example.com");
    expect(mocks.prisma.tenantConfig.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      data: { preferredAccessStrategy: "DOMAIN" }
    });
  });

  it("supports alias-only access mode without creating a domain", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "tenant-1" });

    const response = await POST(
      makeRequest("POST", { accessStrategy: "api-alias", isPrimary: true }),
      { params }
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.accessStrategy).toBe("api-alias");
    expect(payload.apiAliasPath).toBe("/api/platform/route/tenant-1");
    expect(payload.domain).toBeNull();
    expect(mocks.addCustomDomain).not.toHaveBeenCalled();
    expect(mocks.prisma.tenantDomain.create).not.toHaveBeenCalled();
    expect(mocks.prisma.tenantConfig.update).toHaveBeenCalledWith({
      where: { tenantId: "tenant-1" },
      data: { preferredAccessStrategy: "API_ALIAS" }
    });
  });
});
