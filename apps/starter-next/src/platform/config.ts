import {
  type DashboardConfig,
  type PluginSecurityPolicy,
  type Permission,
  validateDashboardConfig
} from "@universal-admin/core";
import type { ThemeBundle } from "@universal-admin/theming";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const ownerPermissions: Permission[] = ["*:*"];
const adminPermissions: Permission[] = [
  "dashboard:read",
  "crm:read",
  "crm:write",
  "inventory:read",
  "billing:read",
  "schedule:read",
  "reports:read",
  "support:read",
  "marketing:read",
  "procurement:read",
  "people:read",
  "security:read",
  "risk:read",
  "incidents:read",
  "compliance:read",
  "analytics:read",
  "forecasting:read",
  "automation:read",
  "partners:read",
  "data:read",
  "settings:read",
  "settings:write",
  "users:read",
  "flags:read",
  "audit:read"
];

const managerPermissions: Permission[] = [
  "dashboard:read",
  "crm:read",
  "crm:write",
  "inventory:read",
  "schedule:read",
  "reports:read",
  "support:read",
  "marketing:read",
  "procurement:read",
  "people:read",
  "risk:read",
  "incidents:read",
  "compliance:read",
  "analytics:read",
  "forecasting:read",
  "automation:read",
  "partners:read",
  "settings:read",
  "settings:write"
];

const staffPermissions: Permission[] = [
  "dashboard:read",
  "crm:read",
  "schedule:read",
  "support:read",
  "inventory:read",
  "reports:read"
];

const viewerPermissions: Permission[] = ["dashboard:read", "reports:read"];

const configInput: DashboardConfig = {
  modules: [
    {
      id: "overview",
      title: "Executive Overview",
      route: "/",
      category: "overview",
      order: 1,
      icon: "layout-dashboard",
      requiredPermissions: ["dashboard:read"]
    },
    {
      id: "crm",
      title: "CRM & Pipeline",
      route: "/crm",
      category: "customers",
      order: 10,
      icon: "users",
      requiredPermissions: ["crm:read"]
    },
    {
      id: "billing",
      title: "Billing & Payments",
      route: "/billing",
      category: "finance",
      order: 20,
      icon: "credit-card",
      requiredPermissions: ["billing:read"],
      requiredFlags: ["billing-module"]
    },
    {
      id: "scheduling",
      title: "Scheduling",
      route: "/scheduling",
      category: "operations",
      order: 30,
      icon: "calendar",
      requiredPermissions: ["schedule:read"]
    },
    {
      id: "reporting",
      title: "Reporting",
      route: "/reporting",
      category: "operations",
      order: 40,
      icon: "line-chart",
      requiredPermissions: ["reports:read"]
    },
    {
      id: "inventory",
      title: "Inventory Control",
      route: "/inventory",
      category: "operations",
      order: 45,
      icon: "package",
      requiredPermissions: ["inventory:read"]
    },
    {
      id: "support",
      title: "Support Desk",
      route: "/support",
      category: "customers",
      order: 50,
      icon: "life-buoy",
      requiredPermissions: ["support:read"]
    },
    {
      id: "marketing",
      title: "Marketing Performance",
      route: "/marketing",
      category: "customers",
      order: 55,
      icon: "megaphone",
      requiredPermissions: ["marketing:read"]
    },
    {
      id: "procurement",
      title: "Procurement",
      route: "/procurement",
      category: "finance",
      order: 58,
      icon: "shopping-cart",
      requiredPermissions: ["procurement:read"]
    },
    {
      id: "people",
      title: "People & Workforce",
      route: "/people",
      category: "operations",
      order: 62,
      icon: "users-round",
      requiredPermissions: ["people:read"]
    },
    {
      id: "security-ops",
      title: "Security Operations",
      route: "/security-ops",
      category: "security",
      order: 70,
      icon: "shield",
      requiredPermissions: ["security:read"],
      requiredFlags: ["security-ops-module"]
    },
    {
      id: "risk",
      title: "Risk Register",
      route: "/risk",
      category: "security",
      order: 72,
      icon: "alert-triangle",
      requiredPermissions: ["risk:read"]
    },
    {
      id: "incidents",
      title: "Incident Command",
      route: "/incidents",
      category: "operations",
      order: 74,
      icon: "siren",
      requiredPermissions: ["incidents:read"],
      requiredFlags: ["incident-command-module"]
    },
    {
      id: "compliance",
      title: "Compliance Center",
      route: "/compliance",
      category: "security",
      order: 76,
      icon: "file-check",
      requiredPermissions: ["compliance:read"]
    },
    {
      id: "analytics",
      title: "Analytics Studio",
      route: "/analytics",
      category: "operations",
      order: 78,
      icon: "pie-chart",
      requiredPermissions: ["analytics:read"]
    },
    {
      id: "forecasting",
      title: "Forecasting",
      route: "/forecasting",
      category: "operations",
      order: 80,
      icon: "trending-up",
      requiredPermissions: ["forecasting:read"]
    },
    {
      id: "automation",
      title: "Automation Hub",
      route: "/automation",
      category: "automation",
      order: 82,
      icon: "bot",
      requiredPermissions: ["automation:read"],
      requiredFlags: ["automation-hub-module"]
    },
    {
      id: "partners",
      title: "Partner Ecosystem",
      route: "/partners",
      category: "customers",
      order: 84,
      icon: "handshake",
      requiredPermissions: ["partners:read"]
    },
    {
      id: "data-platform",
      title: "Data Platform",
      route: "/data-platform",
      category: "system",
      order: 86,
      icon: "database",
      requiredPermissions: ["data:read"],
      requiredFlags: ["data-platform-module"]
    },
    {
      id: "settings",
      title: "Platform Settings",
      route: "/settings",
      category: "system",
      order: 90,
      icon: "settings",
      requiredPermissions: ["settings:read"],
      requiredFlags: ["settings-module"]
    },
    {
      id: "audit",
      title: "Audit Trail",
      route: "/audit",
      category: "security",
      order: 95,
      icon: "shield-check",
      requiredPermissions: ["audit:read"],
      requiredFlags: ["audit-module"]
    }
  ],
  flags: {
    global: [
      { key: "settings-module", enabled: true },
      { key: "billing-module", enabled: true, rolloutPercentage: 100 },
      { key: "audit-module", enabled: true },
      { key: "security-ops-module", enabled: true },
      { key: "incident-command-module", enabled: true },
      { key: "automation-hub-module", enabled: true },
      { key: "data-platform-module", enabled: true },
      { key: "runtime-plugin-integrations", enabled: true }
    ],
    role: [{ key: "audit-module", enabled: false, roles: ["staff", "viewer"] }],
    tenant: [],
    user: []
  },
  rolePermissions: {
    owner: ownerPermissions,
    admin: adminPermissions,
    manager: managerPermissions,
    staff: staffPermissions,
    viewer: viewerPermissions
  }
};

export const dashboardConfig = validateDashboardConfig(configInput);

export const pluginSecurityPolicy: PluginSecurityPolicy = {
  allowedPluginIds: [
    "overview-core",
    "crm-core",
    "billing-core",
    "schedule-core",
    "reporting-core",
    "inventory-core",
    "support-core",
    "marketing-core",
    "procurement-core",
    "hr-core",
    "security-ops-core",
    "risk-core",
    "incidents-core",
    "compliance-core",
    "analytics-core",
    "forecasting-core",
    "automation-core",
    "partners-core",
    "data-platform-core",
    "settings-core",
    "audit-core",
    "integrations",
    "notifications",
    "*-plugin"
  ],
  signingSecret: "starter-signing-secret-v1",
  signingSecrets: ["starter-signing-secret-v0"],
  strictSignatures: true
};

function parseThemeTokenMap(raw: string | undefined): Record<string, string> | undefined {
  if (!raw || raw.trim().length === 0) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Record<string, string>>((acc, [key, value]) => {
      if (typeof key === "string" && typeof value === "string") {
        acc[key] = value;
      }
      return acc;
    }, {});
  } catch {
    return undefined;
  }
}

function readThemeTokenFile(envVarName: string): Record<string, string> | undefined {
  const configuredPath = process.env[envVarName]?.trim();
  if (!configuredPath) {
    return undefined;
  }

  const absolutePath = resolve(process.cwd(), configuredPath);
  if (!existsSync(absolutePath)) {
    return undefined;
  }

  try {
    const content = readFileSync(absolutePath, "utf8");
    return parseThemeTokenMap(content);
  } catch {
    return undefined;
  }
}

function resolveThemeOverride(jsonEnvName: string, fileEnvName: string) {
  const inline = parseThemeTokenMap(process.env[jsonEnvName]);
  if (inline && Object.keys(inline).length > 0) {
    return inline;
  }

  const fromFile = readThemeTokenFile(fileEnvName);
  if (fromFile && Object.keys(fromFile).length > 0) {
    return fromFile;
  }

  return undefined;
}

const hostThemeOverride = resolveThemeOverride(
  "ADMIN_HOST_THEME_JSON",
  "ADMIN_HOST_THEME_FILE"
);
const tenantThemeOverride = resolveThemeOverride(
  "ADMIN_TENANT_THEME_JSON",
  "ADMIN_TENANT_THEME_FILE"
);

export const dashboardTheme: ThemeBundle = {
  base: {
    "dashboard-bg": "#091225",
    "dashboard-panel": "#10223e",
    "dashboard-muted-panel": "#0e1c34",
    "dashboard-text": "#e2e8f0",
    "dashboard-text-muted": "#93a5c3",
    "dashboard-accent": "#14b8a6",
    "dashboard-border": "#1c365f"
  },
  host: {
    "dashboard-accent": "#1d4ed8",
    ...(hostThemeOverride ?? {})
  },
  tenant: {
    "dashboard-panel": "#0f1f39",
    ...(tenantThemeOverride ?? {})
  }
};
