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
  it("bypasses tenant header injection for platform admin paths", () => {
    const request = makeRequest("http://localhost:3000/_platform", "localhost:3000");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBeNull();
    expect(response.headers.get("x-middleware-request-x-tenant-hostname")).toBeNull();
  });

  it("bypasses tenant header injection for platform API paths", () => {
    const request = makeRequest("http://localhost:3000/api/platform/tenants", "localhost:3000");
    const response = middleware(request);

    expect(response.headers.get("x-middleware-request-x-tenant-mode")).toBeNull();
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
