import type { AuthAdapter, AuthUser } from "./index";
import { extractAuthUserFromHeaders } from "./auth-detector";
import type { Permission } from "@universal-admin/core";

export type TenantAuthProvider = "clerk" | "nextauth" | "jwt" | "platform" | "anonymous";

export interface ClerkTenantAuthConfig {
  provider: "clerk";
  publishableKey: string;
  secretKey: string;
}

export interface NextAuthTenantAuthConfig {
  provider: "nextauth";
  secret: string;
  providers: Record<string, unknown>[];
}

export interface JwtTenantAuthConfig {
  provider: "jwt";
  secret: string;
  issuer?: string;
  audience?: string;
}

export interface PlatformTenantAuthConfig {
  provider: "platform";
}

export interface AnonymousTenantAuthConfig {
  provider: "anonymous";
  defaultRole?: string;
}

export type TenantAuthConfig =
  | ClerkTenantAuthConfig
  | NextAuthTenantAuthConfig
  | JwtTenantAuthConfig
  | PlatformTenantAuthConfig
  | AnonymousTenantAuthConfig;

export function createDynamicAuthAdapter(
  config: TenantAuthConfig,
  tenantId: string
): AuthAdapter {
  switch (config.provider) {
    case "clerk":
      return createClerkTenantAdapter(config, tenantId);
    case "nextauth":
      return createNextAuthTenantAdapter(config, tenantId);
    case "jwt":
      return createJwtTenantAdapter(config, tenantId);
    case "platform":
      return createPlatformTenantAdapter(tenantId);
    case "anonymous":
      return createAnonymousTenantAdapter(config, tenantId);
    default:
      return createPlatformTenantAdapter(tenantId);
  }
}

function createClerkTenantAdapter(
  _config: ClerkTenantAuthConfig,
  tenantId: string
): AuthAdapter {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      // In request context, Clerk session is validated via middleware
      // The user is extracted from the x-clerk-user header set by Clerk middleware
      return null; // Overridden per-request by header extraction
    }
  };
}

function createNextAuthTenantAdapter(
  _config: NextAuthTenantAuthConfig,
  tenantId: string
): AuthAdapter {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      return null; // Overridden per-request by session extraction
    }
  };
}

function createJwtTenantAdapter(
  config: JwtTenantAuthConfig,
  tenantId: string
): AuthAdapter {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      // JWT verification happens in middleware using config.secret
      return null; // Overridden per-request
    }
  };
}

function createPlatformTenantAdapter(tenantId: string): AuthAdapter {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      // Platform auth: centralized Clerk org-based auth
      // User resolved from platform session with tenantId injected
      return null;
    }
  };
}

function createAnonymousTenantAdapter(
  config: AnonymousTenantAuthConfig,
  tenantId: string
): AuthAdapter {
  return {
    async getCurrentUser(): Promise<AuthUser | null> {
      return {
        id: "anonymous",
        email: "anonymous@tenant",
        role: config.defaultRole ?? "viewer",
        tenantId,
        permissions: ["dashboard:read"]
      };
    }
  };
}

export function extractUserFromRequestHeaders(
  headers: Headers,
  tenantId: string,
  authConfig: TenantAuthConfig
): AuthUser | null {
  if (authConfig.provider === "anonymous") {
    return {
      id: "anonymous",
      email: "anonymous@tenant",
      role: "viewer",
      tenantId,
      permissions: ["dashboard:read"]
    };
  }

  if (authConfig.provider === "platform") {
    const platformUser = headers.get("x-platform-user-id");
    const platformEmail = headers.get("x-platform-user-email");
    const platformRole = headers.get("x-platform-user-role");
    if (!platformUser) {
      return null;
    }

    return {
      id: platformUser,
      email: platformEmail ?? "",
      role: platformRole ?? "viewer",
      tenantId,
      permissions: parsePermissions(headers.get("x-platform-permissions"))
    };
  }

  const extracted = extractAuthUserFromHeaders(headers);
  if (!extracted) {
    return null;
  }

  const extractedTenant = extracted.tenantId?.trim();
  if (extractedTenant && extractedTenant !== tenantId) {
    return null;
  }

  return {
    ...extracted,
    tenantId,
    permissions: extracted.permissions.length > 0
      ? extracted.permissions
      : parsePermissions(headers.get("x-auth-permissions"))
  };
}

function parsePermissions(value: string | null): Permission[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is Permission => entry.length > 0 && entry.includes(":"));
}
