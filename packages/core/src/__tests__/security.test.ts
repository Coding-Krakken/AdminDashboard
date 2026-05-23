import { describe, expect, it } from "vitest";
import { signPlugin, validatePluginSecurity } from "../security";
import type { ModulePlugin } from "../types";

const plugin: ModulePlugin = {
  id: "billing-core",
  version: "1.0.0",
  manifest: {
    id: "billing",
    title: "Billing",
    route: "/billing"
  }
};

describe("plugin security", () => {
  it("accepts plugin signed with primary key", () => {
    const signature = signPlugin(plugin, "primary-key");
    const errors = validatePluginSecurity(
      { ...plugin, signature },
      {
        strictSignatures: true,
        signingSecret: "primary-key",
        allowedPluginIds: ["billing-core"]
      }
    );

    expect(errors).toEqual([]);
  });

  it("accepts plugin signed with rotated key", () => {
    const signature = signPlugin(plugin, "old-key");
    const errors = validatePluginSecurity(
      { ...plugin, signature },
      {
        strictSignatures: true,
        signingSecret: "new-key",
        signingSecrets: ["old-key"],
        allowedPluginIds: ["billing-core"]
      }
    );

    expect(errors).toEqual([]);
  });

  it("rejects plugin outside allowlist", () => {
    const signature = signPlugin(plugin, "key");
    const errors = validatePluginSecurity(
      { ...plugin, signature },
      {
        strictSignatures: true,
        signingSecret: "key",
        allowedPluginIds: ["crm-*"]
      }
    );

    expect(errors[0]).toContain("allowlist");
  });
});
