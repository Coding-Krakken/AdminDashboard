import { describe, expect, it } from "vitest";
import {
  ensureSettingsRegistryInitialized,
  listSettingsSchemaCatalog,
  settingsRegistry
} from "../settings";

describe("generated settings schema initialization", () => {
  it("registers generated module schema definitions", async () => {
    await ensureSettingsRegistryInitialized();
    const definition = settingsRegistry.getDefinition("inventory");

    expect(definition).toBeDefined();
  });

  it("uses generated defaults after reset", async () => {
    await ensureSettingsRegistryInitialized();

    settingsRegistry.set("inventory", {
      enabled: false,
      refreshIntervalSeconds: 120
    });

    const resetValues = settingsRegistry.reset("inventory") as
      | Record<string, unknown>
      | undefined;

    expect(resetValues).toBeDefined();
    expect(resetValues?.enabled).toBe(true);
    expect(resetValues?.refreshIntervalSeconds).toBe(60);
  });

  it("registers schema versions for migrated static modules", async () => {
    await ensureSettingsRegistryInitialized();

    const billingDefinition = settingsRegistry.getDefinition("billing");
    const auditDefinition = settingsRegistry.getDefinition("audit");

    expect(billingDefinition?.schemaVersion).toBe(2);
    expect(auditDefinition?.schemaVersion).toBe(2);
  });

  it("registers intelligence automation threshold settings", async () => {
    await ensureSettingsRegistryInitialized();

    const intelligenceDefinition = settingsRegistry.getDefinition("intelligence");
    expect(intelligenceDefinition).toBeDefined();

    const defaults = settingsRegistry.reset("intelligence") as Record<string, unknown>;
    expect(defaults.warningFailureRatePct).toBe(3);
    expect(defaults.criticalFailureRatePct).toBe(10);
    expect(defaults.warningOverdueMinutes).toBe(30);
    expect(defaults.criticalOverdueMinutes).toBe(120);
    expect(defaults.warningSuccessRatePct).toBe(97);
    expect(defaults.sloMaxFailureRatePct).toBe(2);
    expect(defaults.sloMinSuccessRatePct).toBe(98);
    expect(defaults.sloMaxOverdueSchedules).toBe(0);
    expect(defaults.sloMaxStaleLagMinutes).toBe(30);
    expect(defaults.sloMaxP95Attempts).toBe(2);
    expect(defaults.sloMaxFailureRateDeltaPct).toBe(5);
  });

  it("builds settings schema catalog entries for no-code rendering", async () => {
    await ensureSettingsRegistryInitialized();

    const catalog = await listSettingsSchemaCatalog();
    const billing = catalog.find((entry) => entry.moduleId === "billing");
    const intelligence = catalog.find((entry) => entry.moduleId === "intelligence");

    expect(billing).toBeDefined();
    expect(billing?.schemaVersion).toBe(2);
    expect(billing?.fields.some((field) => field.key === "currency")).toBe(true);
    expect(billing?.fields.some((field) => field.key === "retryWindowDays")).toBe(true);

    expect(intelligence).toBeDefined();
    expect(
      intelligence?.fields.some((field) => field.key === "warningFailureRatePct")
    ).toBe(true);
    expect(
      intelligence?.fields.some((field) => field.key === "criticalOverdueMinutes")
    ).toBe(true);
  });
});
