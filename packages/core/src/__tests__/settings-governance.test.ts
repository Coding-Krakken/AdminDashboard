import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SettingsRegistry } from "../settings";

describe("settings governance", () => {
  it("returns safeSet error for unknown module", () => {
    const registry = new SettingsRegistry();
    const result = registry.safeSet("missing", { any: true });

    expect(result.success).toBe(false);
  });

  it("lists registered module ids", () => {
    const registry = new SettingsRegistry();
    registry.register({
      moduleId: "overview",
      schema: z.object({ enabled: z.boolean() }),
      defaults: { enabled: true }
    });
    registry.register({
      moduleId: "billing",
      schema: z.object({ retries: z.number().int() }),
      defaults: { retries: 2 }
    });

    expect(registry.listModuleIds().sort()).toEqual(["billing", "overview"]);
  });
});
