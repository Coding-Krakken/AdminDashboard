import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { signPlugin, type ModulePlugin } from "@universal-admin/core";
import runtimePluginSeed from "./runtime-plugins.json";

const GENERATED_PLUGIN_ROOT_CANDIDATES = [
  path.resolve(process.cwd(), "src/platform/generated"),
  path.resolve(process.cwd(), "apps/starter-next/src/platform/generated")
];

async function resolveGeneratedPluginRoot(): Promise<string | null> {
  for (const candidate of GENERATED_PLUGIN_ROOT_CANDIDATES) {
    try {
      const entries = await readdir(candidate, { withFileTypes: true });
      if (entries.length >= 0) {
        return candidate;
      }
    } catch {
      continue;
    }
  }

  return null;
}

const signWithSecret = (plugin: ModulePlugin, secret: string): ModulePlugin => ({
  ...plugin,
  signature: signPlugin(plugin, secret)
});

export function getStaticPlugins(signingSecret: string): ModulePlugin[] {
  const base: ModulePlugin[] = [
    {
      id: "overview-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "overview",
        title: "Executive Overview",
        route: "/",
        category: "overview",
        order: 1,
        requiredPermissions: ["dashboard:read"]
      }
    },
    {
      id: "crm-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "crm",
        title: "CRM & Pipeline",
        route: "/crm",
        category: "customers",
        order: 10,
        requiredPermissions: ["crm:read"]
      }
    },
    {
      id: "billing-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "billing",
        title: "Billing & Payments",
        route: "/billing",
        category: "finance",
        order: 20,
        requiredPermissions: ["billing:read"],
        requiredFlags: ["billing-module"]
      }
    },
    {
      id: "schedule-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "scheduling",
        title: "Scheduling",
        route: "/scheduling",
        category: "operations",
        order: 30,
        requiredPermissions: ["schedule:read"]
      }
    },
    {
      id: "reporting-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "reporting",
        title: "Reporting",
        route: "/reporting",
        category: "operations",
        order: 40,
        requiredPermissions: ["reports:read"]
      }
    },
    {
      id: "inventory-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "inventory",
        title: "Inventory Control",
        route: "/inventory",
        category: "operations",
        order: 45,
        requiredPermissions: ["inventory:read"]
      }
    },
    {
      id: "support-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "support",
        title: "Support Desk",
        route: "/support",
        category: "customers",
        order: 50,
        requiredPermissions: ["support:read"]
      }
    },
    {
      id: "marketing-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "marketing",
        title: "Marketing Performance",
        route: "/marketing",
        category: "customers",
        order: 55,
        requiredPermissions: ["marketing:read"]
      }
    },
    {
      id: "procurement-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "procurement",
        title: "Procurement",
        route: "/procurement",
        category: "finance",
        order: 58,
        requiredPermissions: ["procurement:read"]
      }
    },
    {
      id: "hr-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "people",
        title: "People & Workforce",
        route: "/people",
        category: "operations",
        order: 62,
        requiredPermissions: ["people:read"]
      }
    },
    {
      id: "security-ops-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "security-ops",
        title: "Security Operations",
        route: "/security-ops",
        category: "security",
        order: 70,
        requiredPermissions: ["security:read"],
        requiredFlags: ["security-ops-module"]
      }
    },
    {
      id: "risk-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "risk",
        title: "Risk Register",
        route: "/risk",
        category: "security",
        order: 72,
        requiredPermissions: ["risk:read"]
      }
    },
    {
      id: "incidents-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "incidents",
        title: "Incident Command",
        route: "/incidents",
        category: "operations",
        order: 74,
        requiredPermissions: ["incidents:read"],
        requiredFlags: ["incident-command-module"]
      }
    },
    {
      id: "compliance-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "compliance",
        title: "Compliance Center",
        route: "/compliance",
        category: "security",
        order: 76,
        requiredPermissions: ["compliance:read"]
      }
    },
    {
      id: "analytics-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "analytics",
        title: "Analytics Studio",
        route: "/analytics",
        category: "operations",
        order: 78,
        requiredPermissions: ["analytics:read"]
      }
    },
    {
      id: "forecasting-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "forecasting",
        title: "Forecasting",
        route: "/forecasting",
        category: "operations",
        order: 80,
        requiredPermissions: ["forecasting:read"]
      }
    },
    {
      id: "automation-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "automation",
        title: "Automation Hub",
        route: "/automation",
        category: "automation",
        order: 82,
        requiredPermissions: ["automation:read"],
        requiredFlags: ["automation-hub-module"]
      }
    },
    {
      id: "partners-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "partners",
        title: "Partner Ecosystem",
        route: "/partners",
        category: "customers",
        order: 84,
        requiredPermissions: ["partners:read"]
      }
    },
    {
      id: "data-platform-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "data-platform",
        title: "Data Platform",
        route: "/data-platform",
        category: "system",
        order: 86,
        requiredPermissions: ["data:read"],
        requiredFlags: ["data-platform-module"]
      }
    },
    {
      id: "settings-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "settings",
        title: "Platform Settings",
        route: "/settings",
        category: "system",
        order: 90,
        requiredPermissions: ["settings:read"],
        requiredFlags: ["settings-module"]
      }
    },
    {
      id: "audit-core",
      version: "1.0.0",
      source: "static",
      manifest: {
        id: "audit",
        title: "Audit Trail",
        route: "/audit",
        category: "security",
        order: 95,
        requiredPermissions: ["audit:read"],
        requiredFlags: ["audit-module"]
      }
    }
  ];

  return base.map((plugin) => signWithSecret(plugin, signingSecret));
}

async function loadGeneratedPlugins(): Promise<ModulePlugin[]> {
  const generatedPluginRoot = await resolveGeneratedPluginRoot();
  if (!generatedPluginRoot) {
    return [];
  }

  try {
    const entries = await readdir(generatedPluginRoot, { withFileTypes: true });
    const manifests = await Promise.all(
      entries
        .filter((entry) => entry.isDirectory())
        .map(async (entry) => {
          const manifestPath = path.join(generatedPluginRoot, entry.name, "manifest.json");
          const raw = await readFile(manifestPath, "utf8");
          return JSON.parse(raw) as ModulePlugin;
        })
    );

    return manifests.map((plugin) => ({
      ...plugin,
      source: "generated" as const
    }));
  } catch {
    return [];
  }
}

export async function getRuntimePlugins(): Promise<ModulePlugin[]> {
  const seeded = (runtimePluginSeed as ModulePlugin[]).map((plugin) => ({
    ...plugin,
    source: "runtime" as const
  }));

  const generated = await loadGeneratedPlugins();
  return [...seeded, ...generated];
}
