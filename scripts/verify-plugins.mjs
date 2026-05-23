#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const workspaceRoot = path.resolve(process.cwd());
const runtimePluginsPath = path.join(
  workspaceRoot,
  "apps/starter-next/src/platform/runtime-plugins.json"
);
const generatedRootCandidates = [
  path.join(workspaceRoot, "apps/starter-next/src/platform/generated"),
  path.join(workspaceRoot, "src/platform/generated")
];

const signingSecret = process.env.PLUGIN_SIGNING_SECRET ?? "starter-signing-secret-v1";
const signingSecrets = [
  signingSecret,
  ...(process.env.PLUGIN_SIGNING_SECRETS
    ? process.env.PLUGIN_SIGNING_SECRETS.split(",").map((value) => value.trim())
    : ["starter-signing-secret-v0"])
].filter(Boolean);
const allowlist = ["integrations", "notifications", "*-plugin"];

const matchesAllowlist = (id) => {
  return allowlist.some((candidate) => {
    if (candidate === "*") return true;
    if (!candidate.includes("*")) return candidate === id;

    const escaped = candidate.replace(/[.+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`^${escaped.replace(/\*/g, ".*")}$`);
    return regex.test(id);
  });
};

const parseVersion = (version) => {
  const match = String(version ?? "").trim().match(/^(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return [0, 0, 0];
  }

  return [Number(match[1]), Number(match[2]), Number(match[3])];
};

const compareVersions = (left, right) => {
  const [leftMajor, leftMinor, leftPatch] = parseVersion(left);
  const [rightMajor, rightMinor, rightPatch] = parseVersion(right);

  if (leftMajor !== rightMajor) {
    return leftMajor - rightMajor;
  }

  if (leftMinor !== rightMinor) {
    return leftMinor - rightMinor;
  }

  return leftPatch - rightPatch;
};

const satisfiesVersionConstraint = (version, constraint) => {
  const normalized = String(constraint ?? "").trim();
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

  return String(version ?? "").trim() === normalized;
};

const sign = (plugin, secret) => {
  const payload = JSON.stringify({
    id: plugin.id,
    version: plugin.version,
    manifest: plugin.manifest
  });

  return crypto.createHmac("sha256", secret).update(payload).digest("hex");
};

if (!fs.existsSync(runtimePluginsPath)) {
  console.error(`Missing runtime plugin file: ${runtimePluginsPath}`);
  process.exit(1);
}

const runtimePlugins = JSON.parse(fs.readFileSync(runtimePluginsPath, "utf8"));

function loadGeneratedPlugins() {
  const generatedRoot = generatedRootCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!generatedRoot) {
    return [];
  }

  const entries = fs
    .readdirSync(generatedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory());

  const plugins = [];

  for (const entry of entries) {
    const manifestPath = path.join(generatedRoot, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      plugins.push(parsed);
    } catch {
      plugins.push({ id: `${entry.name}-invalid-manifest` });
    }
  }

  return plugins;
}

const plugins = [...runtimePlugins, ...loadGeneratedPlugins()];
const pluginById = new Map(plugins.map((plugin) => [plugin.id, plugin]));
const failures = [];

const validateRolloutPolicy = (plugin) => {
  if (!plugin.rollout) {
    return;
  }

  const { rollout } = plugin;
  const validStages = new Set(["enabled", "canary", "disabled"]);
  if (!validStages.has(rollout.stage)) {
    failures.push(
      `Plugin '${plugin.id}' has invalid rollout stage '${String(rollout.stage)}'.`
    );
    return;
  }

  const validateAllowlist = (fieldName) => {
    const value = rollout[fieldName];
    if (value === undefined) {
      return;
    }

    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string")) {
      failures.push(
        `Plugin '${plugin.id}' rollout.${fieldName} must be an array of strings.`
      );
    }
  };

  validateAllowlist("tenantAllowlist");
  validateAllowlist("userAllowlist");
  validateAllowlist("roleAllowlist");

  if (rollout.percentage !== undefined) {
    if (typeof rollout.percentage !== "number" || Number.isNaN(rollout.percentage)) {
      failures.push(`Plugin '${plugin.id}' rollout.percentage must be a valid number.`);
    } else if (rollout.percentage < 0 || rollout.percentage > 100) {
      failures.push(
        `Plugin '${plugin.id}' rollout.percentage must be between 0 and 100.`
      );
    }
  }

  if (rollout.stage === "disabled" && rollout.percentage !== undefined) {
    failures.push(
      `Plugin '${plugin.id}' rollout.percentage is not allowed when stage is 'disabled'.`
    );
  }

  if (rollout.stage === "enabled" && rollout.percentage !== undefined) {
    failures.push(
      `Plugin '${plugin.id}' rollout.percentage is not allowed when stage is 'enabled'.`
    );
  }

  if (rollout.stage === "canary") {
    const hasAllowlist =
      (Array.isArray(rollout.tenantAllowlist) && rollout.tenantAllowlist.length > 0) ||
      (Array.isArray(rollout.userAllowlist) && rollout.userAllowlist.length > 0) ||
      (Array.isArray(rollout.roleAllowlist) && rollout.roleAllowlist.length > 0);
    const hasPercentage = typeof rollout.percentage === "number";

    if (!hasAllowlist && !hasPercentage) {
      failures.push(
        `Plugin '${plugin.id}' canary rollout requires percentage and/or at least one allowlist.`
      );
    }
  }
};

for (const plugin of plugins) {
  if (!matchesAllowlist(plugin.id)) {
    failures.push(`Plugin '${plugin.id}' is not allowlisted.`);
    continue;
  }

  if (!plugin.signature) {
    failures.push(`Plugin '${plugin.id}' has no signature.`);
    continue;
  }

  const isValid = signingSecrets.some(
    (secret) => sign(plugin, secret) === plugin.signature
  );

  if (!isValid) {
    failures.push(`Plugin '${plugin.id}' signature mismatch.`);
  }

  validateRolloutPolicy(plugin);

  const dependencies = Array.isArray(plugin.dependencies) ? plugin.dependencies : [];
  for (const dependency of dependencies) {
    const dependencyPlugin = pluginById.get(dependency.pluginId);
    if (!dependencyPlugin) {
      if (!dependency.optional) {
        failures.push(
          `Plugin '${plugin.id}' depends on '${dependency.pluginId}', but it is not present.`
        );
      }

      continue;
    }

    if (
      dependency.version &&
      !satisfiesVersionConstraint(dependencyPlugin.version, dependency.version)
    ) {
      failures.push(
        `Plugin '${plugin.id}' requires '${dependency.pluginId}' version '${dependency.version}', found '${dependencyPlugin.version}'.`
      );
    }
  }
}

if (failures.length > 0) {
  console.error("Runtime plugin verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Runtime plugin verification passed for ${plugins.length} plugin(s).`);
