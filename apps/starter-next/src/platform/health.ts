import { performance } from "node:perf_hooks";

export interface RuntimeHealthSnapshot {
  status: "healthy" | "degraded";
  checks: {
    pluginRuntimeReady: boolean;
    settingsRegistryReady: boolean;
    dataAdapterWriteMs: number;
    dataAdapterReadMs: number;
    auditAdapterWriteMs: number;
  };
  observedAt: string;
}

export async function collectRuntimeHealth(options: {
  probeDataAdapterWrite: () => Promise<void>;
  probeDataAdapterRead: () => Promise<void>;
  probeAuditWrite: () => Promise<void>;
  pluginRuntimeReady: boolean;
  settingsRegistryReady: boolean;
}): Promise<RuntimeHealthSnapshot> {
  const dataWriteStart = performance.now();
  await options.probeDataAdapterWrite();
  const dataAdapterWriteMs = performance.now() - dataWriteStart;

  const dataReadStart = performance.now();
  await options.probeDataAdapterRead();
  const dataAdapterReadMs = performance.now() - dataReadStart;

  const auditWriteStart = performance.now();
  await options.probeAuditWrite();
  const auditAdapterWriteMs = performance.now() - auditWriteStart;

  const status =
    options.pluginRuntimeReady &&
    options.settingsRegistryReady &&
    dataAdapterWriteMs < 1000 &&
    dataAdapterReadMs < 1000 &&
    auditAdapterWriteMs < 1000
      ? "healthy"
      : "degraded";

  return {
    status,
    checks: {
      pluginRuntimeReady: options.pluginRuntimeReady,
      settingsRegistryReady: options.settingsRegistryReady,
      dataAdapterWriteMs,
      dataAdapterReadMs,
      auditAdapterWriteMs
    },
    observedAt: new Date().toISOString()
  };
}
