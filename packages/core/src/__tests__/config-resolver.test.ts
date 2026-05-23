import { mkdtemp, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveDashboardConfig } from "../config-resolver";

const sampleConfig = {
  modules: [
    {
      id: "overview",
      title: "Overview",
      route: "/",
      requiredPermissions: ["dashboard:read"]
    }
  ],
  flags: {
    global: [{ key: "settings-module", enabled: true }]
  },
  rolePermissions: {
    viewer: ["dashboard:read"]
  }
};

describe("resolveDashboardConfig", () => {
  it("resolves config from inline JSON", async () => {
    const result = await resolveDashboardConfig(JSON.stringify(sampleConfig));
    expect(result.modules[0].id).toBe("overview");
  });

  it("resolves config from env var", async () => {
    const env = {
      ADMIN_DASHBOARD_CONFIG: JSON.stringify(sampleConfig)
    };

    const result = await resolveDashboardConfig(
      { envVar: "ADMIN_DASHBOARD_CONFIG" },
      { env }
    );

    expect(result.rolePermissions.viewer).toContain("dashboard:read");
  });

  it("resolves config from file path", async () => {
    const dir = await mkdtemp(join(tmpdir(), "ua-config-"));
    const filePath = join(dir, "dashboard.json");
    await writeFile(filePath, JSON.stringify(sampleConfig), "utf8");

    const result = await resolveDashboardConfig({ filePath });
    expect(result.flags.global?.[0].key).toBe("settings-module");
  });
});
