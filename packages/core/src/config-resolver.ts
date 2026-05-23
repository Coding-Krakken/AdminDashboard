import { readFile } from "node:fs/promises";
import type { DashboardConfigInput } from "./config/schema";
import { validateDashboardConfig } from "./config/validate";
import type { DashboardConfig } from "./types";

export type DashboardConfigSource =
  | DashboardConfigInput
  | {
      filePath: string;
    }
  | {
      envVar: string;
    }
  | string;

export interface ResolveDashboardConfigOptions {
  env?: NodeJS.ProcessEnv;
}

export async function resolveDashboardConfig(
  source: DashboardConfigSource,
  options: ResolveDashboardConfigOptions = {}
): Promise<DashboardConfig> {
  const env = options.env ?? process.env;

  if (typeof source !== "string" && !isConfigLocatorSource(source)) {
    return validateDashboardConfig(source);
  }

  if (isConfigLocatorSource(source)) {
    if ("filePath" in source) {
      return resolveFromFile(source.filePath);
    }

    return resolveFromEnv(source.envVar, env);
  }

  const normalized = source.trim();
  if (normalized.length === 0) {
    throw new Error("Dashboard config source cannot be empty.");
  }

  if (normalized.startsWith("{")) {
    return resolveFromJson(normalized);
  }

  if (normalized.startsWith("env:")) {
    return resolveFromEnv(normalized.slice(4), env);
  }

  if (env[normalized]) {
    return resolveFromEnv(normalized, env);
  }

  return resolveFromFile(normalized);
}

export const resolveConfig = resolveDashboardConfig;

function isConfigLocatorSource(
  value: unknown
): value is { filePath: string } | { envVar: string } {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  if ("filePath" in value) {
    return typeof (value as { filePath?: unknown }).filePath === "string";
  }

  if ("envVar" in value) {
    return typeof (value as { envVar?: unknown }).envVar === "string";
  }

  return false;
}

async function resolveFromFile(filePath: string): Promise<DashboardConfig> {
  try {
    const raw = await readFile(filePath, "utf8");
    return resolveFromJson(raw);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Unable to load dashboard config from file '${filePath}': ${error.message}`);
    }

    throw new Error(`Unable to load dashboard config from file '${filePath}'.`);
  }
}

function resolveFromEnv(envVar: string, env: NodeJS.ProcessEnv): DashboardConfig {
  const envValue = env[envVar]?.trim();
  if (!envValue) {
    throw new Error(`Environment variable '${envVar}' does not contain dashboard config JSON.`);
  }

  return resolveFromJson(envValue, `environment variable '${envVar}'`);
}

function resolveFromJson(raw: string, sourceLabel = "inline JSON"): DashboardConfig {
  try {
    const parsed = JSON.parse(raw) as DashboardConfigInput;
    return validateDashboardConfig(parsed);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid dashboard config in ${sourceLabel}: ${error.message}`);
    }

    throw new Error(`Invalid dashboard config in ${sourceLabel}.`);
  }
}
