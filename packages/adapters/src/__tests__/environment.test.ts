import { describe, expect, it } from "vitest";
import { createEnvAuthAdapter } from "../environment";

describe("createEnvAuthAdapter", () => {
  it("uses AUTH_USER_JSON when provided", async () => {
    const adapter = createEnvAuthAdapter({
      env: {
        ADMIN_AUTH_PROVIDER: "memory",
        ADMIN_AUTH_USER_JSON: JSON.stringify({
          id: "u-json",
          email: "json@example.com",
          role: "manager",
          tenantId: "tenant-json",
          permissions: ["dashboard:read"]
        })
      }
    });

    const user = await adapter.getCurrentUser();
    expect(user?.id).toBe("u-json");
    expect(user?.role).toBe("manager");
  });

  it("builds fallback user from env fields", async () => {
    const adapter = createEnvAuthAdapter({
      env: {
        ADMIN_AUTH_PROVIDER: "nextauth",
        ADMIN_AUTH_USER_ID: "u-env",
        ADMIN_AUTH_EMAIL: "env@example.com",
        ADMIN_AUTH_PERMISSIONS: "dashboard:read,settings:read"
      }
    });

    const user = await adapter.getCurrentUser();
    expect(user?.id).toBe("u-env");
    expect(user?.permissions).toContain("settings:read");
  });

  it("blocks anonymous by default", () => {
    expect(() =>
      createEnvAuthAdapter({
        env: {
          ADMIN_AUTH_PROVIDER: "anonymous"
        }
      })
    ).toThrow("allowAnonymous");
  });
});
