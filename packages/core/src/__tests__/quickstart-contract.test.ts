import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createEnvAuthAdapter } from "@universal-admin/adapters";
import { createDashboard } from "../sdk";

const ORIGINAL_ENV = { ...process.env };

function resetEnv() {
  process.env = { ...ORIGINAL_ENV };
}

function setQuickstartEnv() {
  process.env.ADMIN_DASHBOARD_CONFIG = JSON.stringify({
    modules: [
      {
        id: "overview",
        title: "Overview",
        route: "/admin",
        requiredPermissions: ["dashboard:read"]
      },
      {
        id: "settings",
        title: "Settings",
        route: "/admin/settings",
        requiredPermissions: ["settings:read"]
      }
    ],
    flags: {
      global: []
    },
    rolePermissions: {
      admin: ["dashboard:read", "settings:read"]
    }
  });
  process.env.ADMIN_AUTH_PROVIDER = "memory";
  process.env.ADMIN_AUTH_USER_JSON = JSON.stringify({
    id: "quickstart-user",
    email: "quickstart@example.com",
    role: "admin",
    tenantId: "tenant-quickstart",
    permissions: ["dashboard:read", "settings:read"]
  });
}

afterEach(() => {
  resetEnv();
});

describe("two-step quickstart contract", () => {
  it("supports initialize-once + consume flow for a Next-style host", async () => {
    setQuickstartEnv();

    const dashboard = await createDashboard({
      authAdapter: createEnvAuthAdapter(),
      config: "env:ADMIN_DASHBOARD_CONFIG"
    });

    const model = await dashboard.buildModel({ activeRoute: "/admin" });

    expect(model.shell.activeRoute).toBe("/admin");
    expect(model.shell.primaryNavigation.map((item) => item.id)).toEqual([
      "overview",
      "settings"
    ]);
  });

  it("supports initialize-once + API-call flow for a generic host", async () => {
    setQuickstartEnv();

    const dashboard = await createDashboard({
      authAdapter: createEnvAuthAdapter(),
      config: "env:ADMIN_DASHBOARD_CONFIG"
    });

    async function getAdminModelForApi(activeRoute: string) {
      const model = await dashboard.buildModel({ activeRoute });
      return {
        policyRole: model.policy.role,
        modules: model.modules.map((module) => module.id),
        nav: model.shell.primaryNavigation.map((item) => item.route)
      };
    }

    const first = await getAdminModelForApi("/admin");
    const second = await getAdminModelForApi("/admin/settings");

    expect(first.modules).toEqual(["overview", "settings"]);
    expect(second.modules).toEqual(["overview", "settings"]);
    expect(first.policyRole).toBe("admin");
    expect(second.nav).toContain("/admin/settings");
  });

  it("keeps docs and templates aligned with the two-step contract", async () => {
    const files = [
      "INTEGRATION.md",
      "templates/next-app-integration.ts",
      "templates/express-integration.ts",
      "templates/react-embedded.tsx"
    ];

    const contents = await Promise.all(
      files.map((file) =>
        fs.readFile(path.resolve(process.cwd(), file), "utf8").then((content) => ({
          file,
          content
        }))
      )
    );

    for (const { file, content } of contents) {
      expect(content, `${file} should use createDashboard`).toContain("createDashboard");
      expect(content, `${file} should use env auth adapter`).toContain(
        "createEnvAuthAdapter"
      );
      expect(content, `${file} should use env config pointer`).toContain(
        "env:ADMIN_DASHBOARD_CONFIG"
      );
    }
  });
});
