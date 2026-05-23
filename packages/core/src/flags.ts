import type { FlagContext, FlagLayers, FlagRule } from "./types";

const clampPercentage = (value?: number): number => {
  if (typeof value !== "number") return 100;
  if (value < 0) return 0;
  if (value > 100) return 100;
  return value;
};

const hashToBucket = (input: string): number => {
  let hash = 0;
  for (let i = 0; i < input.length; i += 1) {
    hash = (hash << 5) - hash + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash) % 100;
};

export function isFlagEnabled(rule: FlagRule, context: FlagContext): boolean {
  if (!rule.enabled) return false;

  if (rule.roles?.length && (!context.role || !rule.roles.includes(context.role))) {
    return false;
  }

  if (
    rule.tenantIds?.length &&
    (!context.tenantId || !rule.tenantIds.includes(context.tenantId))
  ) {
    return false;
  }

  if (rule.userIds?.length && (!context.userId || !rule.userIds.includes(context.userId))) {
    return false;
  }

  const rollout = clampPercentage(rule.rolloutPercentage);
  if (rollout >= 100) return true;
  if (!context.userId) return false;

  return hashToBucket(`${rule.key}:${context.userId}`) < rollout;
}

export function buildFlagMap(
  rules: FlagRule[],
  context: FlagContext
): Record<string, boolean> {
  return rules.reduce<Record<string, boolean>>((acc, rule) => {
    acc[rule.key] = isFlagEnabled(rule, context);
    return acc;
  }, {});
}

const pickRuleForContext = (
  rules: FlagRule[] | undefined,
  key: string,
  context: FlagContext
): FlagRule | undefined => {
  if (!rules) return undefined;

  return rules
    .filter((rule) => rule.key === key)
    .find((rule) => isFlagEnabled(rule, context));
};

export function resolveFlagFromLayers(
  key: string,
  layers: FlagLayers,
  context: FlagContext,
  fallback = false
): boolean {
  const resolutionOrder: Array<FlagRule[] | undefined> = [
    layers.user,
    layers.role,
    layers.tenant,
    layers.global
  ];

  for (const layer of resolutionOrder) {
    const matched = pickRuleForContext(layer, key, context);
    if (matched) {
      return isFlagEnabled(matched, context);
    }
  }

  return fallback;
}

export function buildLayeredFlagMap(
  keys: string[],
  layers: FlagLayers,
  context: FlagContext,
  fallback = false
): Record<string, boolean> {
  return keys.reduce<Record<string, boolean>>((acc, key) => {
    acc[key] = resolveFlagFromLayers(key, layers, context, fallback);
    return acc;
  }, {});
}
