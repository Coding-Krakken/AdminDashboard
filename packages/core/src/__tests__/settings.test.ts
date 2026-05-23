import { describe, expect, it } from "vitest";
import { z } from "zod";
import { SettingsRegistry } from "../settings";

describe("settings registry", () => {
  it("supports safeSet and reset lifecycle", () => {
    const registry = new SettingsRegistry();

    registry.register({
      moduleId: "billing",
      schema: z.object({
        currency: z.string().length(3),
        retries: z.number().int().min(0)
      }),
      defaults: {
        currency: "USD",
        retries: 2
      }
    });

    expect(registry.get("billing")).toEqual({ currency: "USD", retries: 2 });

    const invalid = registry.safeSet("billing", { currency: "US", retries: 1 });
    expect(invalid.success).toBe(false);

    const valid = registry.safeSet("billing", { currency: "EUR", retries: 4 });
    expect(valid.success).toBe(true);
    expect(registry.get("billing")).toEqual({ currency: "EUR", retries: 4 });

    const reset = registry.reset("billing");
    expect(reset).toEqual({ currency: "USD", retries: 2 });
    expect(registry.get("billing")).toEqual({ currency: "USD", retries: 2 });
  });

  it("exposes definitions and module ids", () => {
    const registry = new SettingsRegistry();
    registry.register({
      moduleId: "overview",
      schema: z.object({ enabled: z.boolean() }),
      defaults: { enabled: true }
    });

    expect(registry.getDefinition("overview")).toBeTruthy();
    expect(registry.listModuleIds()).toContain("overview");
  });

  it("applies migrations from older schema versions", () => {
    const registry = new SettingsRegistry();

    registry.register({
      moduleId: "billing",
      schemaVersion: 2,
      schema: z.object({
        currency: z.string().length(3),
        retryWindowDays: z.number().int().min(1).max(30)
      }),
      migrations: [
        {
          fromVersion: 1,
          toVersion: 2,
          migrate: (input) => {
            const record =
              input && typeof input === "object"
                ? (input as Record<string, unknown>)
                : {};

            return {
              ...record,
              retryWindowDays:
                typeof record.retryWindow === "number"
                  ? record.retryWindow
                  : record.retryWindowDays
            };
          }
        }
      ]
    });

    const result = registry.parse(
      "billing",
      {
        currency: "USD",
        retryWindow: 7
      },
      { sourceSchemaVersion: 1 }
    );

    expect(result.migrated).toBe(true);
    expect(result.schemaVersion).toBe(2);
    expect(result.values).toEqual({
      currency: "USD",
      retryWindowDays: 7
    });
  });

  it("throws when migration path is missing", () => {
    const registry = new SettingsRegistry();

    registry.register({
      moduleId: "audit",
      schemaVersion: 3,
      schema: z.object({ retentionDays: z.number().int() })
    });

    expect(() =>
      registry.parse("audit", { retentionDays: 365 }, { sourceSchemaVersion: 1 })
    ).toThrow("Missing settings migration");
  });
});
