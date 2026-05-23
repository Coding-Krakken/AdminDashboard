import type { Permission, UserPolicyContext } from "./types";

export function hasPermission(
  context: UserPolicyContext,
  permission: Permission
): boolean {
  return context.permissions.includes("*:*") || context.permissions.includes(permission);
}

export function hasAllPermissions(
  context: UserPolicyContext,
  permissions: Permission[]
): boolean {
  return permissions.every((permission) => hasPermission(context, permission));
}

export function hasAnyPermission(
  context: UserPolicyContext,
  permissions: Permission[]
): boolean {
  if (permissions.length === 0) return true;
  return permissions.some((permission) => hasPermission(context, permission));
}

export function canAccessRoute(
  context: UserPolicyContext,
  requiredPermissions: Permission[]
): boolean {
  return hasAllPermissions(context, requiredPermissions);
}
