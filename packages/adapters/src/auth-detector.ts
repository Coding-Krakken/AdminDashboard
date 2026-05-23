import type { Permission } from "@universal-admin/core";
import type { AuthUser } from "./index";

export type DetectedAuthProvider = "jwt" | "nextauth" | "clerk" | "unknown";

export function detectAuthProvider(headers: Headers | Record<string, string>): DetectedAuthProvider {
  const get = headerGetter(headers);

  if (get("x-clerk-user-id")) {
    return "clerk";
  }

  if (get("x-nextauth-user")) {
    return "nextauth";
  }

  const authorization = get("authorization");
  if (authorization?.toLowerCase().startsWith("bearer ")) {
    return "jwt";
  }

  return "unknown";
}

export function extractAuthUserFromHeaders(
  headers: Headers | Record<string, string>
): AuthUser | null {
  const provider = detectAuthProvider(headers);
  const get = headerGetter(headers);

  if (provider === "clerk") {
    const userId = get("x-clerk-user-id");
    if (!userId) {
      return null;
    }

    return {
      id: userId,
      email: get("x-clerk-email") ?? "unknown@example.com",
      role: get("x-clerk-role") ?? "viewer",
      tenantId: get("x-clerk-tenant-id") ?? undefined,
      permissions: parsePermissions(get("x-clerk-permissions"))
    };
  }

  if (provider === "nextauth") {
    const rawHeader = get("x-nextauth-user");
    if (!rawHeader) {
      return null;
    }

    try {
      const parsed = JSON.parse(rawHeader) as Record<string, unknown>;
      return claimsToAuthUser(parsed);
    } catch {
      return null;
    }
  }

  if (provider === "jwt") {
    const token = getBearerToken(get("authorization"));
    if (!token) {
      return null;
    }

    const claims = parseJwtClaims(token);
    if (!claims) {
      return null;
    }

    return claimsToAuthUser(claims);
  }

  return null;
}

function parsePermissions(value: string | null | undefined): Permission[] {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((entry) => entry.trim())
    .filter((entry): entry is Permission => isPermission(entry));
}

function claimsToAuthUser(claims: Record<string, unknown>): AuthUser {
  const id =
    typeof claims.sub === "string"
      ? claims.sub
      : typeof claims.userId === "string"
        ? claims.userId
        : "unknown-user";

  const email =
    typeof claims.email === "string"
      ? claims.email
      : typeof claims.emailAddress === "string"
        ? claims.emailAddress
        : "unknown@example.com";

  return {
    id,
    email,
    role: typeof claims.role === "string" ? claims.role : "viewer",
    tenantId: typeof claims.tenantId === "string" ? claims.tenantId : undefined,
    permissions: claimsToPermissions(claims.permissions)
  };
}

function claimsToPermissions(value: unknown): Permission[] {
  if (Array.isArray(value)) {
    return value.filter((entry): entry is Permission => isPermission(entry));
  }

  if (typeof value === "string") {
    return parsePermissions(value);
  }

  return [];
}

function isPermission(value: unknown): value is Permission {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.includes(":")
  );
}

function parseJwtClaims(token: string): Record<string, unknown> | null {
  const parts = token.split(".");
  if (parts.length !== 3) {
    return null;
  }

  try {
    const payload = decodeBase64Url(parts[1]);
    return JSON.parse(payload) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  return Buffer.from(padded, "base64").toString("utf8");
}

function getBearerToken(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const [scheme, token] = value.split(" ");
  if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
    return null;
  }

  return token;
}

function headerGetter(headers: Headers | Record<string, string>) {
  if (typeof (headers as Headers).get === "function") {
    return (name: string) => (headers as Headers).get(name);
  }

  const map = Object.fromEntries(
    Object.entries(headers as Record<string, string>).map(([key, value]) => [
      key.toLowerCase(),
      value
    ])
  );

  return (name: string) => map[name.toLowerCase()] ?? null;
}
