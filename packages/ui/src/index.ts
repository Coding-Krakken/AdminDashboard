import { hasAllPermissions } from "@universal-admin/core";
import type { ModuleManifest, UserPolicyContext } from "@universal-admin/core";

export interface NavigationItem {
  id: string;
  label: string;
  route: string;
  category?: ModuleManifest["category"];
  icon?: string;
}

export interface ShellModel {
  activeRoute: string;
  primaryNavigation: NavigationItem[];
  groupedNavigation: Record<string, NavigationItem[]>;
}

export function buildNavigation(
  modules: ModuleManifest[],
  policy: UserPolicyContext,
  enabledFlags: Record<string, boolean>
): NavigationItem[] {
  return modules
    .filter((module) => {
      const requiredPermissions = module.requiredPermissions ?? [];
      const requiredFlags = module.requiredFlags ?? [];

      const permissionsOk = hasAllPermissions(policy, requiredPermissions);
      const flagsOk = requiredFlags.every((flagKey) => enabledFlags[flagKey] !== false);

      return permissionsOk && flagsOk;
    })
    .map((module) => ({
      id: module.id,
      label: module.title,
      route: module.route,
      category: module.category,
      icon: module.icon
    }));
}

export function groupNavigationByCategory(
  items: NavigationItem[]
): Record<string, NavigationItem[]> {
  return items.reduce<Record<string, NavigationItem[]>>((acc, item) => {
    const category = item.category ?? "uncategorized";
    if (!acc[category]) {
      acc[category] = [];
    }

    acc[category].push(item);
    return acc;
  }, {});
}

export function buildShellModel(
  items: NavigationItem[],
  activeRoute: string
): ShellModel {
  return {
    activeRoute,
    primaryNavigation: items,
    groupedNavigation: groupNavigationByCategory(items)
  };
}
