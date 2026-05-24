import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../../middleware";

function makeRequest(url: string, host: string): NextRequest {
  return new NextRequest(url, {
    headers: {
      host
    }
  });
}

describe("saas middleware tenant routing", () => {
  it("rewrites platform alias path to tenant route and injects tenant id", () => {
    const request = makeRequest(
      "https://admin-dashboard.vercel.app/api/platform/route/tenant-1/settings?tab=security",
      "admin-dashboard.vercel.app"
    );
    const response = middleware(request);

    expect(response.headers.get("x-middleware-rewrite")).toContain("/settings?tab=security");
    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBe("tenant");
    expect(response.headers.get("x-middleware-request-x-tenant-id")).toBe("tenant-1");
  });

  it("marks platform admin paths as platform mode", () => {
    const request = makeRequest("http://localhost:3000/_platform", "localhost:3000");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBe("platform");
    expect(response.headers.get("x-middleware-request-x-tenant-hostname")).toBeNull();
  });

  it("marks platform API paths as platform mode", () => {
    const request = makeRequest("http://localhost:3000/api/platform/tenants", "localhost:3000");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBe("platform");
    expect(response.headers.get("x-middleware-request-x-tenant-hostname")).toBeNull();
  });

  it("marks known platform hosts as platform mode", () => {
    const request = makeRequest("https://admin-dashboard.vercel.app/", "admin-dashboard.vercel.app");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBe("platform");
    expect(response.headers.get("x-middleware-request-x-tenant-hostname")).toBeNull();
  });

  it("marks custom hosts as tenant mode with normalized hostname", () => {
    const request = makeRequest("https://tenant.example.com/", "Tenant.Example.com:443");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBe("tenant");
    expect(response.headers.get("x-middleware-request-x-tenant-hostname")).toBe("tenant.example.com");
  });
});
