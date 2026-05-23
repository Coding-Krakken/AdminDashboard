export type Role = string;

export type Permission = `${string}:${string}`;

export type FlagValue = boolean;

export type ModuleCategory =
  | "overview"
  | "operations"
  | "customers"
  | "finance"
  | "automation"
  | "security"
  | "system"
  | "custom";

export type CapabilityMaturity = "core" | "extended" | "beta";

export type ModuleDataSourceType = "internal" | "external" | "warehouse" | "stream";

export interface ModuleCapabilityDescriptor {
  id: string;
  label?: string;
  maturity?: CapabilityMaturity;
  operations?: string[];
}

export interface ModuleDataSourceDescriptor {
  id: string;
  type: ModuleDataSourceType;
  entity: string;
  realtime?: boolean;
}

export interface FlagRule {
  key: string;
  enabled: boolean;
  rolloutPercentage?: number;
  roles?: Role[];
  tenantIds?: string[];
  userIds?: string[];
}

export interface FlagContext {
  role?: Role;
  tenantId?: string;
  userId?: string;
}

export interface FlagLayers {
  global?: FlagRule[];
  tenant?: FlagRule[];
  role?: FlagRule[];
  user?: FlagRule[];
}

export interface ModuleManifest {
  id: string;
  title: string;
  route: string;
  category?: ModuleCategory;
  order?: number;
  description?: string;
  icon?: string;
  dependsOn?: string[];
  requiredPermissions?: Permission[];
  requiredFlags?: string[];
  enabledByDefault?: boolean;
  tags?: string[];
  capabilities?: ModuleCapabilityDescriptor[];
  dataSources?: ModuleDataSourceDescriptor[];
}

export interface UserPolicyContext {
  role: Role;
  permissions: Permission[];
}

export interface PluginRuntimeContext {
  flags: Record<string, boolean>;
  policy: UserPolicyContext;
  tenantId?: string;
  userId?: string;
}

export interface PluginRolloutPolicy {
  stage: "enabled" | "canary" | "disabled";
  percentage?: number;
  tenantAllowlist?: string[];
  userAllowlist?: string[];
  roleAllowlist?: string[];
}

export interface ModulePlugin {
  id: string;
  version: string;
  signature?: string;
  source?: "static" | "runtime" | "generated";
  dependencies?: Array<{
    pluginId: string;
    version?: string;
    optional?: boolean;
  }>;
  manifest: ModuleManifest;
  rollout?: PluginRolloutPolicy;
  setup?: (context: PluginRuntimeContext) => void | Promise<void>;
  hooks?: {
    onInit?: (context: PluginRuntimeContext) => void | Promise<void>;
    onRouteEnter?: (
      route: string,
      context: PluginRuntimeContext
    ) => void | Promise<void>;
    onAction?: (
      action: string,
      payload: unknown,
      context: PluginRuntimeContext
    ) => void | Promise<void>;
  };
}

export interface PluginCompatibilityCheck {
  relation: "dependsOn" | "dependentOf";
  pluginId: string;
  optional: boolean;
  constraint?: string;
  actualVersion?: string;
  satisfied: boolean;
  reason?: string;
}

export interface PluginCompatibilityReport {
  pluginId: string;
  version: string;
  compatible: boolean;
  rolloutStage?: PluginRolloutPolicy["stage"];
  rolloutEnabled?: boolean;
  rolloutReason?: string;
  checks: PluginCompatibilityCheck[];
}

export interface PluginSecurityPolicy {
  allowedPluginIds?: string[];
  signingSecret?: string;
  signingSecrets?: string[];
  strictSignatures?: boolean;
}

export interface ModuleSettingsSnapshot {
  moduleId: string;
  values: unknown;
  version?: number;
  updatedAt?: string | null;
  updatedBy?: string | null;
}

export interface DashboardConfig {
  modules: ModuleManifest[];
  flags: FlagLayers;
  rolePermissions: Record<Role, Permission[]>;
}
