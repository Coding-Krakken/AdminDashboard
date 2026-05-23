import { describe, expect, it } from "vitest";
import {
  createClerkAuthAdapter,
  createJwtAuthAdapter,
  createNextAuthAdapter
} from "../auth-providers";

describe("auth provider adapters", () => {
  it("maps jwt payload into auth user", async () => {
    const adapter = createJwtAuthAdapter({
      resolveToken: async () => "token",
      decodeToken: () => ({
        sub: "u1",
        email: "user@example.com",
        role: "admin",
        tenantId: "tenant-a",
        permissions: ["dashboard:read"]
      })
    });

    const user = await adapter.getCurrentUser();
    expect(user?.id).toBe("u1");
    expect(user?.role).toBe("admin");
  });

  it("maps nextauth session into auth user", async () => {
    const adapter = createNextAuthAdapter({
      getSession: async () => ({
        user: {
          id: "u2",
          email: "next@example.com",
          role: "manager",
          permissions: ["reports:read"]
        }
      })
    });

    const user = await adapter.getCurrentUser();
    expect(user?.email).toBe("next@example.com");
    expect(user?.permissions).toContain("reports:read");
  });

  it("maps clerk session into auth user", async () => {
    const adapter = createClerkAuthAdapter({
      getSession: async () => ({
        userId: "u3",
        emailAddress: "clerk@example.com",
        publicMetadata: {
          role: "owner",
          tenantId: "tenant-b",
          permissions: ["*:*"]
        }
      })
    });

    const user = await adapter.getCurrentUser();
    expect(user?.id).toBe("u3");
    expect(user?.tenantId).toBe("tenant-b");
  });
});
