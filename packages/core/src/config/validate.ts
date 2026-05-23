import { dashboardConfigSchema, type DashboardConfigInput } from "./schema";
import type { DashboardConfig } from "../types";
import type { z } from "zod";

export function validateDashboardConfig(input: DashboardConfigInput): DashboardConfig {
  return dashboardConfigSchema.parse(input) as DashboardConfig;
}

export function safeValidateDashboardConfig(input: DashboardConfigInput) {
  return dashboardConfigSchema.safeParse(input) as z.SafeParseReturnType<
    DashboardConfigInput,
    DashboardConfig
  >;
}
