import type { ModuleManifest } from "@universal-admin/core";

export type BusinessProfile =
  | "generic"
  | "field-service"
  | "saas"
  | "commerce";

interface ModulePack {
  id: BusinessProfile;
  label: string;
  moduleIds: string[];
  forcedFlags?: Record<string, boolean>;
}

const coreModuleIds = new Set([
  "overview",
  "crm",
  "billing",
  "scheduling",
  "reporting",
  "inventory",
  "support",
  "marketing",
  "procurement",
  "people",
  "security-ops",
  "risk",
  "incidents",
  "compliance",
  "analytics",
  "forecasting",
  "automation",
  "partners",
  "data-platform",
  "settings",
  "audit"
]);

const modulePacks: Record<BusinessProfile, ModulePack> = {
  generic: {
    id: "generic",
    label: "Generic Operations",
    moduleIds: [
      "overview",
      "crm",
      "billing",
      "scheduling",
      "reporting",
      "inventory",
      "support",
      "marketing",
      "procurement",
      "people",
      "security-ops",
      "risk",
      "incidents",
      "compliance",
      "analytics",
      "forecasting",
      "automation",
      "partners",
      "data-platform",
      "settings",
      "audit"
    ]
  },
  "field-service": {
    id: "field-service",
    label: "Field Service",
    moduleIds: [
      "overview",
      "crm",
      "scheduling",
      "reporting",
      "inventory",
      "support",
      "incidents",
      "compliance",
      "analytics",
      "automation",
      "settings",
      "audit"
    ],
    forcedFlags: {
      "billing-module": false,
      "runtime-plugin-integrations": true
    }
  },
  saas: {
    id: "saas",
    label: "SaaS",
    moduleIds: [
      "overview",
      "crm",
      "billing",
      "reporting",
      "support",
      "marketing",
      "people",
      "risk",
      "compliance",
      "analytics",
      "forecasting",
      "automation",
      "partners",
      "data-platform",
      "settings",
      "audit"
    ],
    forcedFlags: {
      "runtime-plugin-integrations": true
    }
  },
  commerce: {
    id: "commerce",
    label: "Commerce",
    moduleIds: [
      "overview",
      "crm",
      "billing",
      "reporting",
      "inventory",
      "support",
      "marketing",
      "procurement",
      "security-ops",
      "risk",
      "incidents",
      "analytics",
      "forecasting",
      "automation",
      "partners",
      "data-platform",
      "settings",
      "audit",
      "integrations",
      "notifications"
    ],
    forcedFlags: {
      "billing-module": true,
      "runtime-plugin-integrations": true
    }
  }
};

export function resolveBusinessProfile(
  rawProfile: string | undefined
): BusinessProfile {
  if (!rawProfile) return "generic";

  const normalized = rawProfile.toLowerCase();
  if (normalized === "field-service") return "field-service";
  if (normalized === "saas") return "saas";
  if (normalized === "commerce") return "commerce";

  return "generic";
}

export function getModulePack(profile: BusinessProfile): ModulePack {
  return modulePacks[profile];
}

export function listModulePacks(): ModulePack[] {
  return Object.values(modulePacks);
}

export function filterModulesByPack(
  modules: ModuleManifest[],
  profile: BusinessProfile
): ModuleManifest[] {
  const pack = getModulePack(profile);
  const allow = new Set(pack.moduleIds);
  return modules.filter((module) => {
    if (allow.has(module.id)) {
      return true;
    }

    return !coreModuleIds.has(module.id);
  });
}

export function applyPackFlags(
  flags: Record<string, boolean>,
  profile: BusinessProfile
): Record<string, boolean> {
  const pack = getModulePack(profile);
  return {
    ...flags,
    ...(pack.forcedFlags ?? {})
  };
}
