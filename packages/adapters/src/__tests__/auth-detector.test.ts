import { describe, expect, it } from "vitest";
import {
  detectAuthProvider,
  extractAuthUserFromHeaders
} from "../auth-detector";

describe("auth-detector", () => {
  it("detects clerk headers", () => {
    const provider = detectAuthProvider({
      "x-clerk-user-id": "clerk-1"
    });

    expect(provider).toBe("clerk");
  });

  it("detects nextauth headers", () => {
    const provider = detectAuthProvider({
      "x-nextauth-user": JSON.stringify({ sub: "u1" })
    });

    expect(provider).toBe("nextauth");
  });

  it("extracts user from jwt token headers", () => {
    const payload = Buffer.from(
      JSON.stringify({
        sub: "jwt-user",
        email: "jwt@example.com",
        role: "admin",
        permissions: ["dashboard:read"]
      })
    ).toString("base64url");

    const token = `header.${payload}.signature`;

    const user = extractAuthUserFromHeaders({
      authorization: `Bearer ${token}`
    });

    expect(user?.id).toBe("jwt-user");
    expect(user?.permissions).toContain("dashboard:read");
  });
});
