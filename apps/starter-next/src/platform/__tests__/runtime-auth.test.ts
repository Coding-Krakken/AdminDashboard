import { describe, expect, it } from "vitest";
import type { UserPolicyContext } from "@universal-admin/core";
import {
  buildPluginRolloutSummary,
  buildDashboardModel,
  buildModuleCapabilityCatalog,
  canUserAccessModule,
  canUserAccessAdminRuntime,
  canUserMutateSettings,
  canUserReadSettings,
  getUserDashboardLayout,
  getProfileCatalog,
  updateUserDashboardLayout
} from "../runtime";

describe("runtime auth guards", () => {
  it("allows settings reads for settings read permission", () => {
    const policy: UserPolicyContext = {
      role: "admin",
      permissions: ["settings:read"]
    };

    expect(canUserReadSettings(policy)).toBe(true);
  });

  it("allows non-viewer roles with settings write", () => {
    const policy: UserPolicyContext = {
      role: "admin",
      permissions: ["settings:write"]
    };

    expect(canUserMutateSettings(policy)).toBe(true);
  });

  it("denies viewer role even with permission", () => {
    const policy: UserPolicyContext = {
      role: "viewer",
      permissions: ["settings:read", "settings:write"]
    };

    expect(canUserMutateSettings(policy)).toBe(false);
  });

  it("denies mutation when settings write permission is missing", () => {
    const policy: UserPolicyContext = {
      role: "manager",
      permissions: ["dashboard:read", "settings:read"]
    };

    expect(canUserMutateSettings(policy)).toBe(false);
  });

  it("allows runtime access with dashboard read", () => {
    const policy: UserPolicyContext = {
      role: "staff",
      permissions: ["dashboard:read"]
    };

    expect(canUserAccessAdminRuntime(policy)).toBe(true);
  });

  it("denies runtime access without dashboard read", () => {
    const policy: UserPolicyContext = {
      role: "staff",
      permissions: ["crm:read"]
    };

    expect(canUserAccessAdminRuntime(policy)).toBe(false);
  });
});

describe("profile catalog", () => {
  it("returns all profile ids", () => {
    const ids = getProfileCatalog().map((profile) => profile.id).sort();
    expect(ids).toEqual(["commerce", "field-service", "generic", "saas"]);
  });
});

describe("module access checks", () => {
  it("allows configured module for current profile", async () => {
    const accessible = await canUserAccessModule("overview");
    expect(accessible).toBe(true);
  });

  it("allows generated extension module access", async () => {
    const accessible = await canUserAccessModule("inventory");
    expect(accessible).toBe(true);
  });

  it("builds module capability catalog entries with category defaults", async () => {
    const model = await buildDashboardModel();
    const catalog = buildModuleCapabilityCatalog(model.modules);
    const overview = catalog.find((entry) => entry.moduleId === "overview");

    expect(overview).toBeDefined();
    expect(overview?.capabilities.length).toBeGreaterThan(0);
    expect(overview?.capabilities.some((item) => item.id === "monitoring.kpi")).toBe(true);
    expect(overview?.dataSources.some((item) => item.id === "runtime-kpis")).toBe(true);
  });

  it("builds rollout summary counters from compatibility data", () => {
    const summary = buildPluginRolloutSummary([
      {
        pluginId: "always-on",
        version: "1.0.0",
        compatible: true,
        rolloutStage: "enabled",
        rolloutEnabled: true,
        checks: []
      },
      {
        pluginId: "pilot-on",
        version: "1.0.0",
        compatible: true,
        rolloutStage: "canary",
        rolloutEnabled: true,
        checks: []
      },
      {
        pluginId: "pilot-off",
        version: "1.0.0",
        compatible: true,
        rolloutStage: "canary",
        rolloutEnabled: false,
        checks: []
      }
    ]);

    expect(summary.total).toBe(3);
    expect(summary.enabled).toBe(2);
    expect(summary.disabled).toBe(1);
    expect(summary.canary.total).toBe(2);
    expect(summary.canary.enabled).toBe(1);
    expect(summary.canary.blocked).toBe(1);
  });

  it("includes rollout summary in dashboard model", async () => {
    const model = await buildDashboardModel();

    expect(model.pluginRolloutSummary.total).toBe(model.pluginCompatibility.length);
    expect(
      model.pluginRolloutSummary.enabled + model.pluginRolloutSummary.disabled
    ).toBe(model.pluginRolloutSummary.total);
  });

  it("persists normalized dashboard layout preferences per user", async () => {
    const before = await getUserDashboardLayout();
    expect(before.columns).toBeGreaterThan(0);

    const updated = await updateUserDashboardLayout({
      profileId: "commerce",
      widgets: ["kpi.revenue", "ops.incidents", 42],
      columns: 99
    });

    expect(updated.profileId).toBe("commerce");
    expect(updated.widgets).toEqual(["kpi.revenue", "ops.incidents"]);
    expect(updated.columns).toBe(6);

    const after = await getUserDashboardLayout();
    expect(after.profileId).toBe("commerce");
    expect(after.widgets).toEqual(["kpi.revenue", "ops.incidents"]);
    expect(after.columns).toBe(6);
  });
});
