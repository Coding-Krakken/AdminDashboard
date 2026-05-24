import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  const prisma = {
    tenant: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn()
    }
  };

  return {
    prisma,
    enforcePlatformAccess: vi.fn()
  };
});

vi.mock("@/platform/db", () => ({
  prisma: mocks.prisma
}));

vi.mock("@/platform/platform-auth", () => ({
  enforcePlatformAccess: mocks.enforcePlatformAccess
}));

import { GET, POST } from "../route";

function makeRequest(method: "GET" | "POST", body?: unknown): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants", {
    method,
    ...(body === undefined ? {} : { body: JSON.stringify(body) })
  });
}

describe("platform tenants route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.enforcePlatformAccess.mockReturnValue(null);
  });

  it("returns blocked response when auth guard fails", async () => {
    mocks.enforcePlatformAccess.mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 })
    );

    const response = await GET(makeRequest("GET"));

    expect(response.status).toBe(401);
  });

  it("lists tenants for authorized requests", async () => {
    mocks.prisma.tenant.findMany.mockResolvedValue([{ id: "tenant-1", slug: "alpha" }]);

    const response = await GET(makeRequest("GET"));
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.tenants).toEqual([{ id: "tenant-1", slug: "alpha" }]);
    expect(mocks.prisma.tenant.findMany).toHaveBeenCalledWith({
      include: { domains: true },
      orderBy: { createdAt: "desc" }
    });
  });

  it("returns 400 when create payload is invalid", async () => {
    const response = await POST(makeRequest("POST", { slug: "A" }));

    expect(response.status).toBe(400);
  });

  it("returns 409 when tenant slug already exists", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue({ id: "existing" });

    const response = await POST(
      makeRequest("POST", {
        slug: "acme",
        name: "Acme"
      })
    );

    expect(response.status).toBe(409);
  });

  it("creates tenant and returns 201", async () => {
    mocks.prisma.tenant.findUnique.mockResolvedValue(null);
    mocks.prisma.tenant.create.mockResolvedValue({
      id: "tenant-new",
      slug: "acme",
      name: "Acme",
      domains: []
    });

    const response = await POST(
      makeRequest("POST", {
        slug: "acme",
        name: "Acme"
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(payload.tenant.id).toBe("tenant-new");
    expect(mocks.prisma.tenant.create).toHaveBeenCalledTimes(1);
  });
});
