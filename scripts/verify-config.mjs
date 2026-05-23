#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd());
const configPath = path.join(
  workspaceRoot,
  "apps/starter-next/src/platform/config.ts"
);
const generatedRootCandidates = [
  path.join(workspaceRoot, "apps/starter-next/src/platform/generated"),
  path.join(workspaceRoot, "src/platform/generated")
];

if (!fs.existsSync(configPath)) {
  console.error(`Missing config file: ${configPath}`);
  process.exit(1);
}

const source = fs.readFileSync(configPath, "utf8");

const modulePermissionMatches = Array.from(
  source.matchAll(/requiredPermissions:\s*\[([^\]]*)\]/g)
).map((match) =>
  Array.from(match[1].matchAll(/"([^"]+)"/g)).map((inner) => inner[1])
);

const rolePermissionMatches = Array.from(
  source.matchAll(/Permissions:\s*Permission\[\]\s*=\s*\[([^\]]*)\]/g)
).flatMap((match) =>
  Array.from(match[1].matchAll(/"([^"]+)"/g)).map((inner) => inner[1])
);

const namedRolePermissionMatches = Array.from(
  source.matchAll(/const\s+(\w+Permissions):\s*Permission\[\]\s*=\s*\[([^\]]*)\]/g)
).map((match) => ({
  roleSetName: match[1],
  permissions: Array.from(match[2].matchAll(/"([^"]+)"/g)).map((inner) => inner[1])
}));

const knownPermissions = new Set(rolePermissionMatches);
const hasWildcard = knownPermissions.has("*:*");
const explicitPermissions = new Set(
  namedRolePermissionMatches
    .filter((entry) => entry.roleSetName !== "ownerPermissions")
    .flatMap((entry) => entry.permissions)
    .filter((permission) => permission !== "*:*")
);

const moduleFlagMatches = Array.from(
  source.matchAll(/requiredFlags:\s*\[([^\]]*)\]/g)
).map((match) =>
  Array.from(match[1].matchAll(/"([^"]+)"/g)).map((inner) => inner[1])
);

const definedFlags = new Set(
  Array.from(source.matchAll(/key:\s*"([^"]+)"/g)).map((match) => match[1])
);

const failures = [];

function collectGeneratedManifestRequirements() {
  const permissionGroups = [];
  const flagGroups = [];

  const generatedRoot = generatedRootCandidates.find((candidate) =>
    fs.existsSync(candidate)
  );

  if (!generatedRoot) {
    return { permissionGroups, flagGroups };
  }

  const entries = fs.readdirSync(generatedRoot, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isDirectory()) {
      continue;
    }

    const manifestPath = path.join(generatedRoot, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) {
      continue;
    }

    try {
      const raw = fs.readFileSync(manifestPath, "utf8");
      const parsed = JSON.parse(raw);
      const manifest = parsed?.manifest;

      permissionGroups.push(Array.isArray(manifest?.requiredPermissions) ? manifest.requiredPermissions : []);
      flagGroups.push(Array.isArray(manifest?.requiredFlags) ? manifest.requiredFlags : []);
    } catch {
      failures.push(`Generated module manifest could not be parsed: ${manifestPath}`);
    }
  }

  return { permissionGroups, flagGroups };
}

const generatedRequirements = collectGeneratedManifestRequirements();
const allPermissionGroups = [
  ...modulePermissionMatches,
  ...generatedRequirements.permissionGroups
];
const allFlagGroups = [...moduleFlagMatches, ...generatedRequirements.flagGroups];

for (const permissionGroup of allPermissionGroups) {
  for (const permission of permissionGroup) {
    if (!hasWildcard && !knownPermissions.has(permission)) {
      failures.push(`Permission '${permission}' is required by a module but not present in any role mapping.`);
    }

    if (!explicitPermissions.has(permission)) {
      failures.push(
        `Permission '${permission}' is required by a module but is not explicitly mapped in non-owner roles.`
      );
    }
  }
}

for (const flagGroup of allFlagGroups) {
  for (const flag of flagGroup) {
    if (!definedFlags.has(flag)) {
      failures.push(`Flag '${flag}' is required by a module but not defined in any flag layer.`);
    }
  }
}

if (failures.length > 0) {
  console.error("Config verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log("Config verification passed.");
