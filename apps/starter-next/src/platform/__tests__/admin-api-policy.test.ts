import { describe, expect, it } from "vitest";
import { getAdminApiPolicy } from "../admin-api-policy";

describe("admin api policy matrix", () => {
  it("includes all expected policy actions", () => {
    const policy = getAdminApiPolicy();

    expect(Object.keys(policy).sort()).toEqual([
      "audit:read",
      "audit:summary:read",
      "health:read",
      "intelligence:read",
      "policy:read",
      "profiles:read",
      "runtime:read",
      "settings:module:read",
      "settings:module:write",
      "settings:read",
      "settings:write"
    ]);
  });

  it("requires non-viewer role for write actions", () => {
    const policy = getAdminApiPolicy();

    expect(policy["settings:write"].requireNonViewer).toBe(true);
    expect(policy["settings:module:write"].requireNonViewer).toBe(true);
  });

  it("requires module access checks for module-scoped actions", () => {
    const policy = getAdminApiPolicy();

    expect(policy["settings:module:read"].requireModuleAccess).toBe(true);
    expect(policy["settings:module:write"].requireModuleAccess).toBe(true);
  });

  it("requires tenant binding checks for all admin actions", () => {
    const policy = getAdminApiPolicy();

    for (const action of Object.keys(policy)) {
      expect(policy[action as keyof typeof policy].requireTenantBinding).toBe(true);
    }
  });
});
