#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd());
const adminRoutesRoot = path.join(
  workspaceRoot,
  "apps/starter-next/app/api/admin"
);
const policyFilePath = path.join(
  workspaceRoot,
  "apps/starter-next/src/platform/admin-api-policy.ts"
);

if (!fs.existsSync(adminRoutesRoot)) {
  console.error(`Missing admin routes root: ${adminRoutesRoot}`);
  process.exit(1);
}

if (!fs.existsSync(policyFilePath)) {
  console.error(`Missing policy file: ${policyFilePath}`);
  process.exit(1);
}

function collectRouteFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const entryPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectRouteFiles(entryPath));
      continue;
    }

    if (entry.isFile() && entry.name === "route.ts") {
      files.push(entryPath);
    }
  }

  return files;
}

const routeFiles = collectRouteFiles(adminRoutesRoot);
const policySource = fs.readFileSync(policyFilePath, "utf8");
const declaredActions = new Set(
  Array.from(policySource.matchAll(/"([a-z:]+)":\s*\{/g)).map((match) => match[1])
);

const failures = [];
const usedActions = new Set();

for (const routeFile of routeFiles) {
  const source = fs.readFileSync(routeFile, "utf8");

  if (!source.includes("authorizeAdminApiRequest")) {
    failures.push(`${routeFile}: missing authorizeAdminApiRequest usage.`);
    continue;
  }

  const actions = Array.from(source.matchAll(/action:\s*"([a-z:]+)"/g)).map(
    (match) => match[1]
  );

  if (actions.length === 0) {
    failures.push(`${routeFile}: no authorization action specified.`);
    continue;
  }

  for (const action of actions) {
    usedActions.add(action);
    if (!declaredActions.has(action)) {
      failures.push(`${routeFile}: unknown authorization action '${action}'.`);
    }
  }
}

for (const action of declaredActions) {
  if (!usedActions.has(action)) {
    failures.push(`Policy action '${action}' is declared but unused by any admin route.`);
  }
}

if (failures.length > 0) {
  console.error("Admin API policy verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Admin API policy verification passed for ${routeFiles.length} route file(s) and ${declaredActions.size} action(s).`
);
