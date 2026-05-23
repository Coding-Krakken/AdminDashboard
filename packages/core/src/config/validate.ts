import { dashboardConfigSchema, type DashboardConfigInput } from "./schema";

export function validateDashboardConfig(input: DashboardConfigInput) {
  return dashboardConfigSchema.parse(input);
}

export function safeValidateDashboardConfig(input: DashboardConfigInput) {
  return dashboardConfigSchema.safeParse(input);
}
