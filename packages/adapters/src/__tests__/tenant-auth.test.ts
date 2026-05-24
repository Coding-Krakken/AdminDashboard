import { describe, expect, it } from "vitest";
import { createDynamicAuthAdapter, extractUserFromRequestHeaders } from "../tenant-auth";

describe("tenant-auth", () => {
  it("extracts user from jwt headers and normalizes tenantId", () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-1",
        email: "u@example.com",
        role: "admin",
        permissions: ["dashboard:read"],
        tenantId: "tenant-a"
      })
    ).toString("base64url");

    const token = `x.${payload}.y`;
    const headers = new Headers({
      authorization: `Bearer ${token}`
    });

    const user = extractUserFromRequestHeaders(headers, "tenant-a", {
      provider: "jwt",
      secret: "unused-in-header-mode"
    });

    expect(user?.id).toBe("user-1");
    expect(user?.tenantId).toBe("tenant-a");
    expect(user?.permissions).toContain("dashboard:read");
  });

  it("rejects cross-tenant user claims", () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: "user-2",
        tenantId: "tenant-b"
      })
    ).toString("base64url");

    const token = `x.${payload}.y`;
    const headers = new Headers({
      authorization: `Bearer ${token}`
    });

    const user = extractUserFromRequestHeaders(headers, "tenant-a", {
      provider: "jwt",
      secret: "unused"
    });

    expect(user).toBeNull();
  });

  it("supports platform provider headers", () => {
    const headers = new Headers({
      "x-platform-user-id": "platform-user",
      "x-platform-user-email": "platform@example.com",
      "x-platform-user-role": "owner",
      "x-platform-permissions": "dashboard:read,settings:write"
    });

    const user = extractUserFromRequestHeaders(headers, "tenant-a", {
      provider: "platform"
    });

    expect(user?.id).toBe("platform-user");
    expect(user?.permissions).toContain("settings:write");
    expect(user?.tenantId).toBe("tenant-a");
  });

  it("uses anonymous dynamic auth adapter fallback", async () => {
    const adapter = createDynamicAuthAdapter(
      {
        provider: "anonymous",
        defaultRole: "viewer"
      },
      "tenant-anon"
    );

    const user = await adapter.getCurrentUser();

    expect(user?.id).toBe("anonymous");
    expect(user?.tenantId).toBe("tenant-anon");
    expect(user?.permissions).toContain("dashboard:read");
  });

  it("supports explicit anonymous provider extraction", () => {
    const user = extractUserFromRequestHeaders(new Headers(), "tenant-a", {
      provider: "anonymous"
    });

    expect(user?.id).toBe("anonymous");
    expect(user?.tenantId).toBe("tenant-a");
  });
});
