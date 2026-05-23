import type { Permission } from "@universal-admin/core";
import type { AuthAdapter, AuthUser } from "./index";

export interface CreateEnvAuthAdapterOptions {
  env?: NodeJS.ProcessEnv;
  prefix?: string;
  allowAnonymous?: boolean;
}

export function createEnvAuthAdapter(
  options: CreateEnvAuthAdapterOptions = {}
): AuthAdapter {
  const env = options.env ?? process.env;
  const prefix = options.prefix ?? "ADMIN_";
  const provider = (env[`${prefix}AUTH_PROVIDER`] ?? "memory").toLowerCase();

  if (provider === "anonymous") {
    if (!options.allowAnonymous) {
      throw new Error(
        `Refusing anonymous auth adapter for provider '${provider}'. Set allowAnonymous=true to enable.`
      );
    }

    return {
      async getCurrentUser() {
        return null;
      }
    };
  }

  const explicitUser = parseUserJson(env[`${prefix}AUTH_USER_JSON`]);
  if (explicitUser) {
    return {
      async getCurrentUser() {
        return explicitUser;
      }
    };
  }

  const parsedPermissions = parsePermissions(env[`${prefix}AUTH_PERMISSIONS`]);
  const user: AuthUser = {
    id: env[`${prefix}AUTH_USER_ID`] ?? "starter-user",
    email: env[`${prefix}AUTH_EMAIL`] ?? "starter@example.com",
    role: env[`${prefix}AUTH_ROLE`] ?? defaultRoleForProvider(provider),
    tenantId: env[`${prefix}AUTH_TENANT_ID`] ?? "default-tenant",
    permissions:
      parsedPermissions.length > 0
        ? parsedPermissions
        : defaultPermissionsForProvider(provider)
  };

  return {
    async getCurrentUser() {
      return user;
    }
  };
}

function parseUserJson(raw: string | undefined): AuthUser | null {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<AuthUser>;
    if (!parsed.id || !parsed.email) {
      throw new Error("AUTH_USER_JSON must include id and email.");
    }

    return {
      id: parsed.id,
      email: parsed.email,
      role: parsed.role ?? "viewer",
      tenantId: parsed.tenantId,
      permissions: parsed.permissions ?? []
    };
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`Invalid AUTH_USER_JSON value: ${error.message}`);
    }

    throw new Error("Invalid AUTH_USER_JSON value.");
  }
}

function parsePermissions(raw: string | undefined): Permission[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is Permission => entry.length > 0);
}

function defaultRoleForProvider(provider: string): string {
  if (provider === "clerk" || provider === "nextauth") {
    return "admin";
  }

  return "owner";
}

function defaultPermissionsForProvider(provider: string): Permission[] {
  if (provider === "memory") {
    return ["*:*"];
  }

  return ["dashboard:read", "settings:read"];
}
