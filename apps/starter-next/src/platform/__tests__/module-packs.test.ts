import { describe, expect, it } from "vitest";
import {
  applyPackFlags,
  filterModulesByPack,
  resolveBusinessProfile
} from "../module-packs";

describe("module packs", () => {
  it("resolves unknown profile to generic", () => {
    expect(resolveBusinessProfile("unknown-profile")).toBe("generic");
  });

  it("filters modules according to field-service pack", () => {
    const modules = [
      { id: "overview", title: "Overview", route: "/" },
      { id: "billing", title: "Billing", route: "/billing" },
      { id: "scheduling", title: "Scheduling", route: "/scheduling" },
      { id: "inventory", title: "Inventory", route: "/inventory" }
    ];

    const filtered = filterModulesByPack(modules, "field-service");
    expect(filtered.map((m) => m.id)).toEqual([
      "overview",
      "scheduling",
      "inventory"
    ]);
  });

  it("applies forced flag overrides for pack", () => {
    const flags = applyPackFlags({ "billing-module": true }, "field-service");
    expect(flags["billing-module"]).toBe(false);
  });
});
