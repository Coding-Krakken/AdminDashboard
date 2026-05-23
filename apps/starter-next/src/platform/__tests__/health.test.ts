import { describe, expect, it } from "vitest";
import { collectRuntimeHealth } from "../health";

describe("runtime health", () => {
  it("reports healthy when checks pass and probes are fast", async () => {
    const snapshot = await collectRuntimeHealth({
      pluginRuntimeReady: true,
      settingsRegistryReady: true,
      probeDataAdapterWrite: async () => undefined,
      probeDataAdapterRead: async () => undefined,
      probeAuditWrite: async () => undefined
    });

    expect(snapshot.status).toBe("healthy");
    expect(snapshot.checks.pluginRuntimeReady).toBe(true);
  });
});
