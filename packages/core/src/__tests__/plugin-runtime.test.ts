import { describe, expect, it, vi } from "vitest";
import { PluginRuntime } from "../plugin-runtime";
import { signPlugin } from "../security";
import type { ModulePlugin, PluginRuntimeContext } from "../types";

const createPlugin = (id: string): ModulePlugin => ({
  id,
  version: "1.0.0",
  manifest: {
    id: `${id}-module`,
    title: `${id} title`,
    route: `/${id}`
  }
});

describe("plugin runtime", () => {
  it("rejects disallowed plugin ids", () => {
    const runtime = new PluginRuntime([], {
      securityPolicy: {
        strictSignatures: false,
        allowedPluginIds: ["allowed-*"]
      }
    });

    expect(() => runtime.registerPlugin(createPlugin("blocked-plugin"))).toThrow(
      "allowlist"
    );
  });

  it("calls setup and lifecycle hooks", async () => {
    const setup = vi.fn();
    const onInit = vi.fn();
    const onRouteEnter = vi.fn();
    const onAction = vi.fn();

    const plugin: ModulePlugin = {
      ...createPlugin("hooks-plugin"),
      setup,
      hooks: {
        onInit,
        onRouteEnter,
        onAction
      }
    };

    const signature = signPlugin(plugin, "key");
    const runtime = new PluginRuntime([], {
      securityPolicy: {
        strictSignatures: true,
        signingSecret: "key",
        allowedPluginIds: ["hooks-plugin"]
      }
    });

    runtime.registerPlugin({ ...plugin, signature }, true);

    const context: PluginRuntimeContext = {
      policy: { role: "owner", permissions: ["*:*"] },
      flags: {}
    };

    await runtime.initialize(context);
    await runtime.onRouteEnter("/hooks-plugin", context);
    await runtime.onAction("test.action", { sample: true }, context);

    expect(setup).toHaveBeenCalledTimes(1);
    expect(onInit).toHaveBeenCalledTimes(1);
    expect(onRouteEnter).toHaveBeenCalledTimes(1);
    expect(onAction).toHaveBeenCalledTimes(1);
  });

  it("enforces dependency version constraints on registration", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(createPlugin("base"), true);

    runtime.registerPlugin(
      {
        ...createPlugin("dependent-ok"),
        dependencies: [{ pluginId: "base", version: "^1.0.0" }]
      },
      true
    );

    expect(() =>
      runtime.registerPlugin(
        {
          ...createPlugin("dependent-bad"),
          dependencies: [{ pluginId: "base", version: "^2.0.0" }]
        },
        true
      )
    ).toThrow("requires 'base' version");
  });

  it("prevents registering a version that breaks existing dependents", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(createPlugin("platform"), true);
    runtime.registerPlugin(
      {
        ...createPlugin("integration"),
        dependencies: [{ pluginId: "platform", version: "^1.0.0" }]
      },
      true
    );

    expect(() =>
      runtime.registerPlugin(
        {
          ...createPlugin("platform"),
          version: "2.0.0"
        },
        true
      )
    ).toThrow("requires 'platform' version '^1.0.0'");
  });

  it("exposes compatibility matrix for plugin dependency graph", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(createPlugin("platform"), true);
    runtime.registerPlugin(
      {
        ...createPlugin("integration"),
        dependencies: [{ pluginId: "platform", version: "^1.0.0" }]
      },
      true
    );

    const matrix = runtime.getCompatibilityMatrix();
    const platform = matrix.find((entry) => entry.pluginId === "platform");
    const integration = matrix.find((entry) => entry.pluginId === "integration");

    expect(platform?.compatible).toBe(true);
    expect(
      platform?.checks.some(
        (check) =>
          check.relation === "dependentOf" &&
          check.pluginId === "integration" &&
          check.satisfied
      )
    ).toBe(true);

    expect(integration?.compatible).toBe(true);
    expect(
      integration?.checks.some(
        (check) =>
          check.relation === "dependsOn" &&
          check.pluginId === "platform" &&
          check.constraint === "^1.0.0" &&
          check.actualVersion === "1.0.0" &&
          check.satisfied
      )
    ).toBe(true);
  });

  it("plans active plugin execution in dependency order", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(createPlugin("base"), false);
    runtime.registerPlugin(
      {
        ...createPlugin("dependent"),
        dependencies: [{ pluginId: "base", version: "^1.0.0" }]
      },
      false
    );

    runtime.activatePlugin("dependent");
    runtime.activatePlugin("base");

    expect(runtime.getActivePluginExecutionPlan()).toEqual(["base", "dependent"]);
  });

  it("rejects active execution plan when required dependency is inactive", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(createPlugin("base"), true);
    runtime.registerPlugin(
      {
        ...createPlugin("dependent"),
        dependencies: [{ pluginId: "base", version: "^1.0.0" }]
      },
      true
    );

    runtime.deactivatePlugin("base");

    expect(() => runtime.getActivePluginExecutionPlan()).toThrow(
      "requires active dependency 'base'"
    );
  });

  it("excludes disabled rollout plugins from contextual execution", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(
      {
        ...createPlugin("disabled-plugin"),
        rollout: {
          stage: "disabled"
        }
      },
      true
    );

    const plan = runtime.getContextualActivePluginExecutionPlan({
      policy: { role: "owner", permissions: ["*:*"] },
      flags: {},
      tenantId: "tenant-a",
      userId: "user-a"
    });

    expect(plan).toEqual([]);
  });

  it("supports canary rollout with allowlist override", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(
      {
        ...createPlugin("canary-plugin"),
        rollout: {
          stage: "canary",
          percentage: 0,
          userAllowlist: ["pilot-user"]
        }
      },
      true
    );

    const deniedPlan = runtime.getContextualActivePluginExecutionPlan({
      policy: { role: "owner", permissions: ["*:*"] },
      flags: {},
      tenantId: "tenant-a",
      userId: "non-pilot"
    });
    expect(deniedPlan).toEqual([]);

    const allowedPlan = runtime.getContextualActivePluginExecutionPlan({
      policy: { role: "owner", permissions: ["*:*"] },
      flags: {},
      tenantId: "tenant-a",
      userId: "pilot-user"
    });
    expect(allowedPlan).toEqual(["canary-plugin"]);
  });

  it("surfaces rollout evaluation details in compatibility matrix", () => {
    const runtime = new PluginRuntime();

    runtime.registerPlugin(
      {
        ...createPlugin("rollout-plugin"),
        rollout: {
          stage: "canary",
          percentage: 0
        }
      },
      true
    );

    const matrix = runtime.getCompatibilityMatrix({
      policy: { role: "owner", permissions: ["*:*"] },
      flags: {},
      tenantId: "tenant-a",
      userId: "non-pilot"
    });

    expect(matrix).toHaveLength(1);
    expect(matrix[0].pluginId).toBe("rollout-plugin");
    expect(matrix[0].rolloutStage).toBe("canary");
    expect(matrix[0].rolloutEnabled).toBe(false);
    expect(matrix[0].rolloutReason).toContain("percentage is 0");
  });
});
