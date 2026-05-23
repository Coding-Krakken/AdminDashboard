import { describe, expect, it } from "vitest";
import { GET as getRuntime } from "../runtime/route";
import { GET as getIntelligence } from "../intelligence/route";
import { GET as getSettings } from "../settings/route";

function buildRuntimeSnapshotSignature(payload: Record<string, unknown>) {
  return {
    topLevelKeys: Object.keys(payload).sort(),
    moduleIds: Array.isArray(payload.modules) ? payload.modules : [],
    moduleCatalogSize: Array.isArray(payload.moduleCatalog) ? payload.moduleCatalog.length : 0,
    pluginCounts: payload.pluginCounts,
    pluginRolloutSummary: payload.pluginRolloutSummary,
    healthStatus:
      payload.health && typeof payload.health === "object"
        ? (payload.health as Record<string, unknown>).status
        : null,
    healthCheckKeys:
      payload.health &&
      typeof payload.health === "object" &&
      (payload.health as Record<string, unknown>).checks &&
      typeof (payload.health as Record<string, unknown>).checks === "object"
        ? Object.keys(
            (payload.health as Record<string, unknown>).checks as Record<string, unknown>
          ).sort()
        : []
  };
}

function buildIntelligenceSnapshotSignature(payload: Record<string, unknown>) {
  const runtime =
    payload.runtime && typeof payload.runtime === "object"
      ? (payload.runtime as Record<string, unknown>)
      : {};
  const insights =
    payload.insights && typeof payload.insights === "object"
      ? (payload.insights as Record<string, unknown>)
      : {};
  const automation =
    payload.automation && typeof payload.automation === "object"
      ? (payload.automation as Record<string, unknown>)
      : {};

  return {
    topLevelKeys: Object.keys(payload).sort(),
    profileId:
      payload.profile && typeof payload.profile === "object"
        ? (payload.profile as Record<string, unknown>).id
        : null,
    runtimeModuleCount: Array.isArray(runtime.moduleIds) ? runtime.moduleIds.length : 0,
    runtimeCategoryKeys:
      runtime.modulesByCategory && typeof runtime.modulesByCategory === "object"
        ? Object.keys(runtime.modulesByCategory as Record<string, unknown>).sort()
        : [],
    auditAvailable:
      payload.audit && typeof payload.audit === "object"
        ? (payload.audit as Record<string, unknown>).available
        : null,
    insightKeys: Object.keys(insights).sort(),
    trendKeys:
      payload.trendSeries && typeof payload.trendSeries === "object"
        ? Object.keys(payload.trendSeries as Record<string, unknown>).sort()
        : [],
    automationSummary: {
      policyCount: automation.policyCount,
      enabledPolicyCount: automation.enabledPolicyCount,
      scheduleCount: automation.scheduleCount,
      enabledScheduleCount: automation.enabledScheduleCount
    }
  };
}

describe("admin API payload compatibility", () => {
  it("returns stable runtime payload shape", async () => {
    const response = await getRuntime(new Request("http://localhost/api/admin/runtime"));

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.user).toBeDefined();
    expect(payload.profile).toBeDefined();
    expect(Array.isArray(payload.modules)).toBe(true);
    expect(payload.moduleCatalog).toBeDefined();
    expect(payload.userLayout).toBeDefined();
    expect(payload.pluginCounts).toBeDefined();
    expect(Array.isArray(payload.pluginExecutionPlan)).toBe(true);
    expect(Array.isArray(payload.pluginCompatibility)).toBe(true);
    expect(Array.isArray(payload.pluginRollout)).toBe(true);
    expect(payload.pluginRolloutSummary).toBeDefined();
    expect(payload.security).toBeDefined();
    expect(payload.flags).toBeDefined();
    expect(payload.health).toBeDefined();

    expect(buildRuntimeSnapshotSignature(payload)).toMatchSnapshot();
  });

  it("returns stable intelligence payload shape", async () => {
    const response = await getIntelligence(
      new Request("http://localhost/api/admin/intelligence?windowDays=7")
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.profile).toBeDefined();
    expect(payload.user).toBeDefined();
    expect(payload.health).toBeDefined();
    expect(Array.isArray(payload.profiles)).toBe(true);
    expect(payload.policy).toBeDefined();
    expect(payload.runtime).toBeDefined();
    expect(payload.audit).toBeDefined();
    expect(payload.kpis).toBeDefined();
    expect(payload.trendSeries).toBeDefined();
    expect(payload.insights).toBeDefined();
    expect(payload.automation).toBeDefined();
    expect(typeof payload.generatedAt).toBe("string");

    expect(buildIntelligenceSnapshotSignature(payload)).toMatchSnapshot();
  });

  it("returns intelligence module settings through moduleId query", async () => {
    const response = await getSettings(
      new Request("http://localhost/api/admin/settings?moduleId=intelligence")
    );

    expect(response.status).toBe(200);

    const payload = (await response.json()) as Record<string, unknown>;

    expect(payload.moduleId).toBe("intelligence");
    expect(typeof payload.version).toBe("number");
    expect(payload.values).toBeDefined();
  });

  it("returns 404 for unknown module settings through moduleId query", async () => {
    const response = await getSettings(
      new Request("http://localhost/api/admin/settings?moduleId=missing-module")
    );

    expect(response.status).toBe(404);

    const payload = (await response.json()) as Record<string, unknown>;
    expect(typeof payload.error).toBe("string");
  });
});
