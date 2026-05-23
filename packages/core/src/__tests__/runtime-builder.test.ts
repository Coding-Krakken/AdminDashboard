import { describe, expect, it } from "vitest";
import { buildRuntimeDashboardModel } from "../runtime-builder";
import type { Permission } from "../types";
import type { ModulePlugin } from "../types";

function createPlugin(id: string): ModulePlugin {
  return {
    id,
    version: "1.0.0",
    manifest: {
      id: `${id}-module`,
      title: `${id} title`,
      route: `/${id}`
    }
  };
}

describe("buildRuntimeDashboardModel", () => {
  it("builds model with plugins, flags, and filtered modules", async () => {
    const staticPlugins = [createPlugin("overview")];
    const runtimePlugins = [
      {
        ...createPlugin("settings"),
        manifest: {
          id: "settings",
          title: "Settings",
          route: "/settings",
          requiredPermissions: ["settings:read" as Permission],
          requiredFlags: ["settings-module"]
        }
      }
    ];

    const result = await buildRuntimeDashboardModel({
      config: {
        modules: [
          {
            id: "overview-module",
            title: "Overview",
            route: "/",
            requiredPermissions: ["dashboard:read"]
          }
        ],
        flags: {
          global: [{ key: "settings-module", enabled: true }]
        },
        rolePermissions: {
          admin: ["dashboard:read", "settings:read"]
        }
      },
      user: { id: "u1", tenantId: "tenant-a" },
      policy: {
        role: "admin",
        permissions: ["dashboard:read", "settings:read"]
      },
      staticPlugins,
      runtimePlugins,
      applyFlags: (flags) => ({ ...flags, custom: true }),
      buildNavigation: (modules) => modules.map((module) => ({ id: module.id })),
      buildShell: (navigation) => ({ navigation })
    });

    expect(result.enabledFlags["settings-module"]).toBe(true);
    expect(result.enabledFlags.custom).toBe(true);
    expect(result.pluginCounts.runtime).toBe(1);
    expect(result.navigation).toEqual([{ id: "overview-module" }, { id: "settings" }]);
  });
});
