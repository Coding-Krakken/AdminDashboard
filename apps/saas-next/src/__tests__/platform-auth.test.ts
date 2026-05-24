import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { checkPlatformRateLimit, enforcePlatformAccess } from "../platform/platform-auth";

function makeRequest(headers: Record<string, string> = {}): NextRequest {
  return new NextRequest("http://localhost/api/platform/tenants", {
    headers
  });
}

describe("platform-auth guard", () => {
  it("returns unauthorized without valid bearer token", () => {
    process.env.PLATFORM_ADMIN_SECRET = "secret";
    const response = enforcePlatformAccess(makeRequest(), "scope:test");

    expect(response?.status).toBe(401);
  });

  it("allows authorized request under limit", () => {
    process.env.PLATFORM_ADMIN_SECRET = "secret";
    process.env.PLATFORM_API_RATE_LIMIT_MAX = "5";
    process.env.PLATFORM_API_RATE_LIMIT_WINDOW_MS = "60000";

    const response = enforcePlatformAccess(
      makeRequest({ authorization: "Bearer secret", "x-forwarded-for": "1.1.1.1" }),
      "scope:allow"
    );

    expect(response).toBeNull();
  });

  it("rate limits when request count exceeds max", () => {
    process.env.PLATFORM_ADMIN_SECRET = "secret";
    process.env.PLATFORM_API_RATE_LIMIT_MAX = "1";
    process.env.PLATFORM_API_RATE_LIMIT_WINDOW_MS = "60000";

    const request = makeRequest({
      authorization: "Bearer secret",
      "x-forwarded-for": "2.2.2.2"
    });

    const first = checkPlatformRateLimit(request, "scope:limit");
    const second = checkPlatformRateLimit(request, "scope:limit");

    expect(first.allowed).toBe(true);
    expect(second.allowed).toBe(false);
    if (!second.allowed) {
      expect(second.response.status).toBe(429);
      expect(second.response.headers.get("Retry-After")).toBeTruthy();
    }
  });

  it("returns retry metadata when enforcePlatformAccess is rate limited", async () => {
    process.env.PLATFORM_ADMIN_SECRET = "secret";
    process.env.PLATFORM_API_RATE_LIMIT_MAX = "1";
    process.env.PLATFORM_API_RATE_LIMIT_WINDOW_MS = "60000";

    const request = makeRequest({
      authorization: "Bearer secret",
      "x-forwarded-for": "3.3.3.3"
    });

    const first = enforcePlatformAccess(request, "scope:enforced-limit");
    const second = enforcePlatformAccess(request, "scope:enforced-limit");

    expect(first).toBeNull();
    expect(second?.status).toBe(429);
    expect(second?.headers.get("Retry-After")).toBeTruthy();

    const payload = await second?.json();
    expect(payload?.error).toBe("Too Many Requests");
    expect(typeof payload?.retryAfterMs).toBe("number");
    expect(payload?.retryAfterMs).toBeGreaterThan(0);
  });
});
