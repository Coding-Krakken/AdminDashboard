import { describe, expect, it } from "vitest";
import { shouldReturnNotFoundForMissingTenant } from "../platform/request-mode";

describe("request-mode missing tenant behavior", () => {
  it("returns true for tenant mode", () => {
    expect(shouldReturnNotFoundForMissingTenant("tenant")).toBe(true);
  });

  it("returns false for platform mode", () => {
    expect(shouldReturnNotFoundForMissingTenant("platform")).toBe(false);
  });

  it("returns false for missing mode", () => {
    expect(shouldReturnNotFoundForMissingTenant(null)).toBe(false);
  });
});
