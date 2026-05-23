import { createHmac } from "node:crypto";
import type { ModulePlugin, PluginSecurityPolicy } from "./types";

const serializePlugin = (plugin: ModulePlugin): string => {
  return JSON.stringify({
    id: plugin.id,
    version: plugin.version,
    manifest: plugin.manifest
  });
};

export function signPlugin(plugin: ModulePlugin, secret: string): string {
  return createHmac("sha256", secret).update(serializePlugin(plugin)).digest("hex");
}

export function isPluginSignatureValid(
  plugin: ModulePlugin,
  secret?: string
): boolean {
  if (!secret) return true;
  if (!plugin.signature) return false;

  return signPlugin(plugin, secret) === plugin.signature;
}

export function isPluginSignatureValidWithAnyKey(
  plugin: ModulePlugin,
  secrets: string[]
): boolean {
  if (!plugin.signature) return false;
  if (secrets.length === 0) return true;

  return secrets.some((secret) => signPlugin(plugin, secret) === plugin.signature);
}

function resolvePolicySecrets(policy: PluginSecurityPolicy): string[] {
  const keys = [policy.signingSecret, ...(policy.signingSecrets ?? [])].filter(
    (key): key is string => Boolean(key)
  );

  return Array.from(new Set(keys));
}

export function isPluginAllowed(
  plugin: ModulePlugin,
  allowlist?: string[]
): boolean {
  if (!allowlist || allowlist.length === 0) return true;

  return allowlist.some((candidate) => {
    if (candidate === "*") return true;

    if (candidate.includes("*")) {
      const escaped = candidate.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
      const wildcardPattern = escaped.replace(/\*/g, ".*");
      const pattern = new RegExp(`^${wildcardPattern}$`);
      return pattern.test(plugin.id);
    }

    return candidate === plugin.id;
  });
}

export function validatePluginSecurity(
  plugin: ModulePlugin,
  policy: PluginSecurityPolicy
): string[] {
  const errors: string[] = [];
  const validationSecrets = resolvePolicySecrets(policy);

  if (!isPluginAllowed(plugin, policy.allowedPluginIds)) {
    errors.push(`Plugin '${plugin.id}' is not in the allowlist.`);
  }

  if (policy.strictSignatures) {
    if (!plugin.signature) {
      errors.push(`Plugin '${plugin.id}' does not include a signature.`);
    } else if (!isPluginSignatureValidWithAnyKey(plugin, validationSecrets)) {
      errors.push(`Plugin '${plugin.id}' signature validation failed.`);
    }
  }

  return errors;
}
