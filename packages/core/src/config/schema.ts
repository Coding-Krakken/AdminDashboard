import { z } from "zod";

const permissionSchema = z.string().regex(/^[a-zA-Z0-9_*.-]+:[a-zA-Z0-9_*.-]+$/);

const moduleCapabilitySchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).optional(),
  maturity: z.enum(["core", "extended", "beta"]).optional(),
  operations: z.array(z.string().min(1)).optional()
});

const moduleDataSourceSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["internal", "external", "warehouse", "stream"]),
  entity: z.string().min(1),
  realtime: z.boolean().optional()
});

export const moduleManifestSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  route: z.string().min(1),
  category: z
    .enum([
      "overview",
      "operations",
      "customers",
      "finance",
      "automation",
      "security",
      "system",
      "custom"
    ])
    .optional(),
  order: z.number().int().nonnegative().optional(),
  description: z.string().optional(),
  icon: z.string().optional(),
  dependsOn: z.array(z.string()).optional(),
  requiredPermissions: z.array(permissionSchema).optional(),
  requiredFlags: z.array(z.string()).optional(),
  enabledByDefault: z.boolean().optional(),
  tags: z.array(z.string().min(1)).optional(),
  capabilities: z.array(moduleCapabilitySchema).optional(),
  dataSources: z.array(moduleDataSourceSchema).optional()
});

export const flagRuleSchema = z.object({
  key: z.string().min(1),
  enabled: z.boolean(),
  rolloutPercentage: z.number().min(0).max(100).optional(),
  roles: z.array(z.string()).optional(),
  tenantIds: z.array(z.string()).optional(),
  userIds: z.array(z.string()).optional()
});

export const flagLayersSchema = z.object({
  global: z.array(flagRuleSchema).optional(),
  tenant: z.array(flagRuleSchema).optional(),
  role: z.array(flagRuleSchema).optional(),
  user: z.array(flagRuleSchema).optional()
});

export const dashboardConfigSchema = z.object({
  modules: z.array(moduleManifestSchema),
  flags: flagLayersSchema,
  rolePermissions: z.record(z.array(permissionSchema))
});

export type DashboardConfigInput = z.input<typeof dashboardConfigSchema>;
