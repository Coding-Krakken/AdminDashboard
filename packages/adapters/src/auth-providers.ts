import type { AuthAdapter, AuthUser } from "./index";

export interface JwtPayloadLike {
  sub?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  permissions?: string[];
}

export interface NextAuthSessionLike {
  user?: {
    id?: string;
    email?: string;
    role?: string;
    tenantId?: string;
    permissions?: string[];
  };
}

export interface ClerkSessionLike {
  userId?: string;
  emailAddress?: string;
  publicMetadata?: {
    role?: string;
    tenantId?: string;
    permissions?: string[];
  };
}

const normalizeUser = (input: {
  id?: string;
  email?: string;
  role?: string;
  tenantId?: string;
  permissions?: string[];
}): AuthUser => {
  return {
    id: input.id ?? "unknown-user",
    email: input.email ?? "unknown@example.com",
    role: input.role ?? "viewer",
    tenantId: input.tenantId,
    permissions: (input.permissions ?? []) as AuthUser["permissions"]
  };
};

export function createJwtAuthAdapter(options: {
  resolveToken: () => Promise<string | null>;
  decodeToken: (token: string) => JwtPayloadLike | null;
}): AuthAdapter {
  return {
    async getCurrentUser() {
      const token = await options.resolveToken();
      if (!token) return null;

      const payload = options.decodeToken(token);
      if (!payload) return null;

      return normalizeUser({
        id: payload.sub,
        email: payload.email,
        role: payload.role,
        tenantId: payload.tenantId,
        permissions: payload.permissions
      });
    }
  };
}

export function createNextAuthAdapter(options: {
  getSession: () => Promise<NextAuthSessionLike | null>;
}): AuthAdapter {
  return {
    async getCurrentUser() {
      const session = await options.getSession();
      if (!session?.user) return null;

      return normalizeUser({
        id: session.user.id,
        email: session.user.email,
        role: session.user.role,
        tenantId: session.user.tenantId,
        permissions: session.user.permissions
      });
    }
  };
}

export function createClerkAuthAdapter(options: {
  getSession: () => Promise<ClerkSessionLike | null>;
}): AuthAdapter {
  return {
    async getCurrentUser() {
      const session = await options.getSession();
      if (!session?.userId) return null;

      return normalizeUser({
        id: session.userId,
        email: session.emailAddress,
        role: session.publicMetadata?.role,
        tenantId: session.publicMetadata?.tenantId,
        permissions: session.publicMetadata?.permissions
      });
    }
  };
}
