import { describe, expect, it } from "vitest";
import { createDashboard } from "../sdk";

describe("createDashboard", () => {
  it("builds a model with permission and flag filtering", async () => {
    const dashboard = await createDashboard({
      config: {
        modules: [
          {
            id: "overview",
            title: "Overview",
            route: "/",
            requiredPermissions: ["dashboard:read"]
          },
          {
            id: "settings",
            title: "Settings",
            route: "/settings",
            requiredPermissions: ["settings:read"],
            requiredFlags: ["settings-module"]
          }
        ],
        flags: {
          global: [{ key: "settings-module", enabled: true }]
        },
        rolePermissions: {
          viewer: ["dashboard:read"],
          admin: ["dashboard:read", "settings:read"]
        }
      },
      authAdapter: {
        async getCurrentUser() {
          return {
            id: "u1",
            email: "admin@example.com",
            role: "admin",
            tenantId: "tenant-a",
            permissions: ["dashboard:read", "settings:read"]
          };
        }
      }
    });

    const model = await dashboard.buildModel({ activeRoute: "/settings" });

    expect(model.modules.map((module) => module.id)).toEqual(["overview", "settings"]);
    expect(model.shell.activeRoute).toBe("/settings");
    expect(model.shell.primaryNavigation).toHaveLength(2);
  });

  it("resolves canAccess from policy context", async () => {
    const dashboard = await createDashboard({
      config: {
        modules: [],
        flags: {},
        rolePermissions: {
          viewer: ["dashboard:read"]
        }
      },
      defaultContext: {
        role: "viewer",
        permissions: ["dashboard:read"]
      }
    });

    expect(dashboard.canAccess("dashboard:read")).toBe(true);
    expect(dashboard.canAccess("settings:write")).toBe(false);
  });
});
