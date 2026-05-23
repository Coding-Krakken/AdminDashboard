#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const generatedRoot = path.resolve(
  process.cwd(),
  "apps/starter-next/src/platform/generated"
);

if (!fs.existsSync(generatedRoot)) {
  console.log("Generated module verification skipped: no generated modules directory.");
  process.exit(0);
}

const moduleDirs = fs
  .readdirSync(generatedRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => path.join(generatedRoot, entry.name));

const failures = [];

for (const moduleDir of moduleDirs) {
  const moduleId = path.basename(moduleDir);
  const manifestPath = path.join(moduleDir, "manifest.json");
  const settingsSchemaPath = path.join(moduleDir, "settings.schema.json");

  if (!fs.existsSync(manifestPath)) {
    failures.push(`${moduleDir}: missing manifest.json`);
  }

  if (!fs.existsSync(settingsSchemaPath)) {
    failures.push(`${moduleDir}: missing settings.schema.json`);
  }

  if (fs.existsSync(settingsSchemaPath)) {
    try {
      const schema = JSON.parse(fs.readFileSync(settingsSchemaPath, "utf8"));
      if (!schema || typeof schema !== "object" || !schema.schema) {
        failures.push(`${moduleDir}: settings.schema.json missing top-level schema field`);
      }

      if (schema?.moduleId !== moduleId) {
        failures.push(
          `${moduleDir}: settings.schema.json moduleId '${schema?.moduleId}' does not match folder '${moduleId}'`
        );
      }
    } catch {
      failures.push(`${moduleDir}: settings.schema.json is not valid JSON`);
    }
  }

  if (fs.existsSync(manifestPath)) {
    try {
      const manifestPlugin = JSON.parse(fs.readFileSync(manifestPath, "utf8"));

      if (manifestPlugin?.manifest?.id !== moduleId) {
        failures.push(
          `${moduleDir}: manifest manifest.id '${manifestPlugin?.manifest?.id}' does not match folder '${moduleId}'`
        );
      }

      if (manifestPlugin?.id !== `${moduleId}-plugin`) {
        failures.push(
          `${moduleDir}: manifest plugin id '${manifestPlugin?.id}' should be '${moduleId}-plugin'`
        );
      }
    } catch {
      failures.push(`${moduleDir}: manifest.json is not valid JSON`);
    }
  }
}

if (failures.length > 0) {
  console.error("Generated module verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(`Generated module verification passed for ${moduleDirs.length} module(s).`);
