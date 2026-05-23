import { hasPermission, type Permission } from "@universal-admin/core";
import { NextResponse } from "next/server";
import {
  canUserAccessModule,
  getCurrentUserContext,
  recordAdminAuditEvent
} from "./runtime";

export type AdminApiAction =
  | "audit:read"
  | "audit:summary:read"
  | "intelligence:read"
  | "runtime:read"
  | "health:read"
  | "profiles:read"
  | "policy:read"
  | "settings:read"
  | "settings:write"
  | "settings:module:read"
  | "settings:module:write";

interface ActionRule {
  anyOfPermissions: Permission[];
  requireNonViewer?: boolean;
  requireModuleAccess?: boolean;
  requireTenantBinding?: boolean;
}

const adminApiPolicy: Record<AdminApiAction, ActionRule> = {
  "audit:read": {
    anyOfPermissions: ["audit:read"],
    requireTenantBinding: true
  },
  "audit:summary:read": {
    anyOfPermissions: ["audit:read"],
    requireTenantBinding: true
  },
  "intelligence:read": {
    anyOfPermissions: ["dashboard:read"],
    requireTenantBinding: true
  },
  "runtime:read": {
    anyOfPermissions: ["dashboard:read"],
    requireTenantBinding: true
  },
  "health:read": {
    anyOfPermissions: ["dashboard:read"],
    requireTenantBinding: true
  },
  "profiles:read": {
    anyOfPermissions: ["dashboard:read"],
    requireTenantBinding: true
  },
  "policy:read": {
    anyOfPermissions: ["dashboard:read"],
    requireTenantBinding: true
  },
  "settings:read": {
    anyOfPermissions: ["settings:read", "settings:write"],
    requireTenantBinding: true
  },
  "settings:write": {
    anyOfPermissions: ["settings:write"],
    requireNonViewer: true,
    requireTenantBinding: true
  },
  "settings:module:read": {
    anyOfPermissions: ["settings:read", "settings:write"],
    requireModuleAccess: true,
    requireTenantBinding: true
  },
  "settings:module:write": {
    anyOfPermissions: ["settings:write"],
    requireNonViewer: true,
    requireModuleAccess: true,
    requireTenantBinding: true
  }
};

interface AuthorizeOptions {
  request: Request;
  action: AdminApiAction;
  moduleId?: string;
}

async function recordAuthorizationFailure(
  options: AuthorizeOptions,
  reason: string,
  status: number
) {
  try {
    await recordAdminAuditEvent({
      request: options.request,
      action: "authz.denied",
      entity: "admin-api",
      entityId: options.action,
      metadata: {
        reason,
        status,
        moduleId: options.moduleId ?? null
      }
    });
  } catch {
    // Best-effort audit logging; authorization response must still proceed.
  }
}

export async function authorizeAdminApiRequest(options: AuthorizeOptions): Promise<
  | {
      ok: true;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  const rule = adminApiPolicy[options.action];

  let policyContext;
  try {
    policyContext = await getCurrentUserContext(options.request);
  } catch {
    await recordAuthorizationFailure(options, "unauthorized", 401);
    return {
      ok: false,
      response: NextResponse.json({ error: "Unauthorized." }, { status: 401 })
    };
  }

  const { policy } = policyContext;

  if (rule.requireTenantBinding) {
    const tenantId = policyContext.user.tenantId?.trim();
    if (!tenantId) {
      await recordAuthorizationFailure(options, "missing-tenant-binding", 403);
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden." }, { status: 403 })
      };
    }

    const tenantHeader = options.request.headers.get("x-admin-tenant-id")?.trim();
    if (tenantHeader && tenantHeader !== tenantId) {
      await recordAuthorizationFailure(options, "tenant-mismatch", 403);
      return {
        ok: false,
        response: NextResponse.json({ error: "Forbidden." }, { status: 403 })
      };
    }
  }

  if (rule.requireNonViewer && policy.role === "viewer") {
    await recordAuthorizationFailure(options, "viewer-blocked", 403);
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 })
    };
  }

  const allowed = rule.anyOfPermissions.some((permission) =>
    hasPermission(policy, permission)
  );

  if (!allowed) {
    await recordAuthorizationFailure(options, "permission-denied", 403);
    return {
      ok: false,
      response: NextResponse.json({ error: "Forbidden." }, { status: 403 })
    };
  }

  if (rule.requireModuleAccess) {
    if (!options.moduleId) {
      await recordAuthorizationFailure(options, "missing-module-id", 400);
      return {
        ok: false,
        response: NextResponse.json(
          { error: "Missing moduleId for module-scoped authorization." },
          { status: 400 }
        )
      };
    }

    const canAccess = await canUserAccessModule(options.moduleId, {
      request: options.request
    });

    if (!canAccess) {
      await recordAuthorizationFailure(options, "module-not-found", 404);
      return {
        ok: false,
        response: NextResponse.json(
          { error: `Unknown module settings for '${options.moduleId}'.` },
          { status: 404 }
        )
      };
    }
  }

  return { ok: true };
}

export function getAdminApiPolicy() {
  return adminApiPolicy;
}
