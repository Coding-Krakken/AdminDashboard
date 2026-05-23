import { hasAllPermissions } from "./policy";
import { ModuleRegistry } from "./registry";
import { validatePluginSecurity } from "./security";
import type {
  PluginCompatibilityReport,
  ModulePlugin,
  ModuleManifest,
  PluginSecurityPolicy,
  PluginRuntimeContext,
  UserPolicyContext
} from "./types";

interface PluginRuntimeOptions {
  securityPolicy?: PluginSecurityPolicy;
}

export class PluginRuntime {
  private registry = new ModuleRegistry();

  private plugins = new Map<string, ModulePlugin>();

  private activePluginIds = new Set<string>();

  private securityPolicy: PluginSecurityPolicy;

  constructor(staticPlugins: ModulePlugin[] = [], options: PluginRuntimeOptions = {}) {
    this.securityPolicy = options.securityPolicy ?? {};

    for (const plugin of staticPlugins) {
      this.registerPlugin(plugin, true);
    }
  }

  registerPlugin(plugin: ModulePlugin, activate = false): void {
    const securityErrors = validatePluginSecurity(plugin, this.securityPolicy);
    if (securityErrors.length > 0) {
      throw new Error(securityErrors.join(" "));
    }

    this.validatePluginDependencies(plugin);
    this.validateDependentCompatibility(plugin);

    this.plugins.set(plugin.id, plugin);
    this.registry.upsert(plugin.manifest);
    if (activate) {
      this.activePluginIds.add(plugin.id);
    }
  }

  unregisterPlugin(pluginId: string): void {
    const plugin = this.plugins.get(pluginId);
    if (!plugin) return;

    this.plugins.delete(pluginId);
    this.activePluginIds.delete(pluginId);
    this.registry.remove(plugin.manifest.id);
  }

  activatePlugin(pluginId: string): void {
    if (!this.plugins.has(pluginId)) {
      throw new Error(`Cannot activate unknown plugin '${pluginId}'.`);
    }

    this.activePluginIds.add(pluginId);
  }

  deactivatePlugin(pluginId: string): void {
    this.activePluginIds.delete(pluginId);
  }

  listModules() {
    return this.registry.list();
  }

  getActivePluginExecutionPlan(): string[] {
    const activeIds = Array.from(this.activePluginIds).filter((pluginId) =>
      this.plugins.has(pluginId)
    );

    return this.resolvePluginExecutionPlan(activeIds, true);
  }

  getContextualActivePluginExecutionPlan(context: PluginRuntimeContext): string[] {
    const activeIds = Array.from(this.activePluginIds).filter((pluginId) => {
      const plugin = this.plugins.get(pluginId);
      return (
        Boolean(plugin) &&
        this.evaluatePluginRollout(plugin as ModulePlugin, context).enabled
      );
    });

    return this.resolvePluginExecutionPlan(activeIds, true);
  }

  getCompatibilityMatrix(context?: PluginRuntimeContext): PluginCompatibilityReport[] {
    const reports: PluginCompatibilityReport[] = [];
    const plugins = Array.from(this.plugins.values()).sort((a, b) => a.id.localeCompare(b.id));

    for (const plugin of plugins) {
      const checks: PluginCompatibilityReport["checks"] = [];

      for (const dependency of plugin.dependencies ?? []) {
        const dependencyPlugin = this.plugins.get(dependency.pluginId);

        if (!dependencyPlugin) {
          checks.push({
            relation: "dependsOn",
            pluginId: dependency.pluginId,
            optional: Boolean(dependency.optional),
            constraint: dependency.version,
            satisfied: Boolean(dependency.optional),
            reason: dependency.optional
              ? "Optional dependency not present."
              : "Required dependency not registered."
          });
          continue;
        }

        const satisfied =
          !dependency.version ||
          satisfiesVersionConstraint(dependencyPlugin.version, dependency.version);

        checks.push({
          relation: "dependsOn",
          pluginId: dependency.pluginId,
          optional: Boolean(dependency.optional),
          constraint: dependency.version,
          actualVersion: dependencyPlugin.version,
          satisfied,
          reason: satisfied
            ? undefined
            : `Expected '${dependency.version}', found '${dependencyPlugin.version}'.`
        });
      }

      for (const dependent of plugins) {
        if (dependent.id === plugin.id) {
          continue;
        }

        const dependency = (dependent.dependencies ?? []).find(
          (candidate) => candidate.pluginId === plugin.id
        );

        if (!dependency) {
          continue;
        }

        const satisfied =
          !dependency.version ||
          satisfiesVersionConstraint(plugin.version, dependency.version);

        checks.push({
          relation: "dependentOf",
          pluginId: dependent.id,
          optional: Boolean(dependency.optional),
          constraint: dependency.version,
          actualVersion: plugin.version,
          satisfied,
          reason: satisfied
            ? undefined
            : `Dependent '${dependent.id}' expects '${dependency.version}', found '${plugin.version}'.`
        });
      }

      checks.sort((left, right) => {
        if (left.relation !== right.relation) {
          return left.relation.localeCompare(right.relation);
        }

        return left.pluginId.localeCompare(right.pluginId);
      });

      const rolloutDecision = context
        ? this.evaluatePluginRollout(plugin, context)
        : null;

      reports.push({
        pluginId: plugin.id,
        version: plugin.version,
        compatible: checks.every((check) => check.satisfied),
        rolloutStage: plugin.rollout?.stage,
        rolloutEnabled: rolloutDecision?.enabled,
        rolloutReason: rolloutDecision?.reason,
        checks
      });
    }

    return reports;
  }

  async initialize(context: PluginRuntimeContext): Promise<void> {
    for (const plugin of this.getActivePlugins(context)) {
      await plugin.setup?.(context);
      await plugin.hooks?.onInit?.(context);
    }
  }

  async onRouteEnter(
    route: string,
    context: PluginRuntimeContext
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(context)) {
      await plugin.hooks?.onRouteEnter?.(route, context);
    }
  }

  async onAction(
    action: string,
    payload: unknown,
    context: PluginRuntimeContext
  ): Promise<void> {
    for (const plugin of this.getActivePlugins(context)) {
      await plugin.hooks?.onAction?.(action, payload, context);
    }
  }

  resolveAccessibleModules(
    policy: UserPolicyContext,
    enabledFlags: Record<string, boolean>
  ): ModuleManifest[] {
    return this.registry.list().filter((module) => {
      const requiredPermissions = module.requiredPermissions ?? [];
      const requiredFlags = module.requiredFlags ?? [];

      return (
        hasAllPermissions(policy, requiredPermissions) &&
        requiredFlags.every((flagKey) => enabledFlags[flagKey] !== false)
      );
    });
  }

  private getActivePlugins(context: PluginRuntimeContext): ModulePlugin[] {
    return this.getContextualActivePluginExecutionPlan(context)
      .map((pluginId) => this.plugins.get(pluginId))
      .filter((plugin): plugin is ModulePlugin => Boolean(plugin));
  }

  private evaluatePluginRollout(
    plugin: ModulePlugin,
    context: PluginRuntimeContext
  ): { enabled: boolean; reason: string } {
    const rollout = plugin.rollout;
    if (!rollout) {
      return { enabled: true, reason: "No rollout policy configured." };
    }

    if (rollout.stage === "disabled") {
      return { enabled: false, reason: "Plugin rollout stage is disabled." };
    }

    const role = context.policy.role;
    const tenantId = context.tenantId;
    const userId = context.userId;

    const matchesAllowlist = (
      allowlist: string[] | undefined,
      value: string | undefined
    ) => {
      if (!allowlist || allowlist.length === 0) {
        return false;
      }

      if (!value) {
        return false;
      }

      return allowlist.includes(value);
    };

    if (matchesAllowlist(rollout.userAllowlist, userId)) {
      return { enabled: true, reason: "User allowlist override matched." };
    }

    if (matchesAllowlist(rollout.tenantAllowlist, tenantId)) {
      return { enabled: true, reason: "Tenant allowlist override matched." };
    }

    if (matchesAllowlist(rollout.roleAllowlist, role)) {
      return { enabled: true, reason: "Role allowlist override matched." };
    }

    if (rollout.stage === "enabled") {
      return { enabled: true, reason: "Plugin rollout stage is enabled." };
    }

    const percentage =
      typeof rollout.percentage === "number"
        ? Math.max(0, Math.min(100, rollout.percentage))
        : 0;

    if (percentage <= 0) {
      return {
        enabled: false,
        reason: "Canary rollout percentage is 0 and no allowlist override matched."
      };
    }

    if (percentage >= 100) {
      return {
        enabled: true,
        reason: "Canary rollout percentage is 100."
      };
    }

    const basis = `${plugin.id}:${tenantId ?? ""}:${userId ?? ""}:${role}`;
    const bucket = stableBucketPercent(basis);
    const enabled = bucket < percentage;
    return {
      enabled,
      reason: enabled
        ? `Canary bucket ${bucket} is below rollout percentage ${percentage}.`
        : `Canary bucket ${bucket} is at or above rollout percentage ${percentage}.`
    };
  }

  private resolvePluginExecutionPlan(
    pluginIds: string[],
    requireActiveDependencies: boolean
  ): string[] {
    const uniqueIds = Array.from(new Set(pluginIds));
    const selected = new Map<string, ModulePlugin>();
    for (const pluginId of uniqueIds) {
      const plugin = this.plugins.get(pluginId);
      if (plugin) {
        selected.set(pluginId, plugin);
      }
    }

    const dependents = new Map<string, string[]>();
    const inDegree = new Map<string, number>();

    for (const pluginId of selected.keys()) {
      dependents.set(pluginId, []);
      inDegree.set(pluginId, 0);
    }

    for (const [pluginId, plugin] of selected.entries()) {
      for (const dependency of plugin.dependencies ?? []) {
        const dependencyPlugin = this.plugins.get(dependency.pluginId);
        if (!dependencyPlugin) {
          if (dependency.optional) {
            continue;
          }

          throw new Error(
            `Plugin '${pluginId}' depends on '${dependency.pluginId}', but it is not registered.`
          );
        }

        if (!selected.has(dependency.pluginId)) {
          if (!dependency.optional && requireActiveDependencies) {
            throw new Error(
              `Plugin '${pluginId}' requires active dependency '${dependency.pluginId}', but it is inactive.`
            );
          }

          continue;
        }

        dependents.get(dependency.pluginId)?.push(pluginId);
        inDegree.set(pluginId, (inDegree.get(pluginId) ?? 0) + 1);
      }
    }

    const byStableOrder = (leftId: string, rightId: string): number => {
      const leftOrder = selected.get(leftId)?.manifest.order ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = selected.get(rightId)?.manifest.order ?? Number.MAX_SAFE_INTEGER;

      if (leftOrder !== rightOrder) {
        return leftOrder - rightOrder;
      }

      return leftId.localeCompare(rightId);
    };

    const queue = Array.from(inDegree.entries())
      .filter(([, degree]) => degree === 0)
      .map(([pluginId]) => pluginId)
      .sort(byStableOrder);

    const plan: string[] = [];
    while (queue.length > 0) {
      const nextId = queue.shift();
      if (!nextId) {
        continue;
      }

      plan.push(nextId);

      for (const dependentId of dependents.get(nextId) ?? []) {
        const nextDegree = (inDegree.get(dependentId) ?? 0) - 1;
        inDegree.set(dependentId, nextDegree);

        if (nextDegree === 0) {
          queue.push(dependentId);
          queue.sort(byStableOrder);
        }
      }
    }

    if (plan.length !== selected.size) {
      const blocked = Array.from(inDegree.entries())
        .filter(([, degree]) => degree > 0)
        .map(([pluginId]) => pluginId)
        .sort();
      throw new Error(
        `Circular active plugin dependencies detected for: ${blocked.join(", ")}`
      );
    }

    return plan;
  }

  private validatePluginDependencies(plugin: ModulePlugin): void {
    for (const dependency of plugin.dependencies ?? []) {
      const dependencyPlugin = this.plugins.get(dependency.pluginId);
      if (!dependencyPlugin) {
        if (dependency.optional) {
          continue;
        }

        throw new Error(
          `Plugin '${plugin.id}' depends on '${dependency.pluginId}', but it is not registered.`
        );
      }

      if (
        dependency.version &&
        !satisfiesVersionConstraint(dependencyPlugin.version, dependency.version)
      ) {
        throw new Error(
          `Plugin '${plugin.id}' requires '${dependency.pluginId}' version '${dependency.version}', but found '${dependencyPlugin.version}'.`
        );
      }
    }
  }

  private validateDependentCompatibility(plugin: ModulePlugin): void {
    for (const candidate of this.plugins.values()) {
      const matchingDependency = (candidate.dependencies ?? []).find(
        (dependency) => dependency.pluginId === plugin.id
      );

      if (!matchingDependency?.version) {
        continue;
      }

      if (!satisfiesVersionConstraint(plugin.version, matchingDependency.version)) {
        throw new Error(
          `Plugin '${candidate.id}' requires '${plugin.id}' version '${matchingDependency.version}', but attempted to register '${plugin.version}'.`
        );
      }
    }
  }
}

function stableBucketPercent(input: string): number {
  let hash = 2166136261;
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return Math.abs(hash >>> 0) % 100;
}

function parseVersion(version: string): [number, number, number] {
  const match = version.trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [0, 0, 0];
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

function compareVersions(left: string, right: string): number {
  const [leftMajor, leftMinor, leftPatch] = parseVersion(left);
  const [rightMajor, rightMinor, rightPatch] = parseVersion(right);

  if (leftMajor !== rightMajor) {
    return leftMajor - rightMajor;
  }

  if (leftMinor !== rightMinor) {
    return leftMinor - rightMinor;
  }

  return leftPatch - rightPatch;
}

function satisfiesVersionConstraint(version: string, constraint: string): boolean {
  const normalized = constraint.trim();
  if (!normalized || normalized === "*") {
    return true;
  }

  if (normalized.startsWith("^")) {
    const minimum = normalized.slice(1).trim();
    const [requiredMajor] = parseVersion(minimum);
    const [actualMajor] = parseVersion(version);
    return actualMajor === requiredMajor && compareVersions(version, minimum) >= 0;
  }

  if (normalized.startsWith("~")) {
    const minimum = normalized.slice(1).trim();
    const [requiredMajor, requiredMinor] = parseVersion(minimum);
    const [actualMajor, actualMinor] = parseVersion(version);
    return (
      actualMajor === requiredMajor &&
      actualMinor === requiredMinor &&
      compareVersions(version, minimum) >= 0
    );
  }

  if (normalized.startsWith(">=")) {
    return compareVersions(version, normalized.slice(2).trim()) >= 0;
  }

  if (normalized.startsWith("<=")) {
    return compareVersions(version, normalized.slice(2).trim()) <= 0;
  }

  if (normalized.startsWith(">")) {
    return compareVersions(version, normalized.slice(1).trim()) > 0;
  }

  if (normalized.startsWith("<")) {
    return compareVersions(version, normalized.slice(1).trim()) < 0;
  }

  return version.trim() === normalized;
}
