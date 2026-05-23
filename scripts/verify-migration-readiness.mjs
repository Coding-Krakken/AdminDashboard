#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd());

const requiredDocs = [
  {
    path: "docs/migrations/starter-to-saas-playbook.md",
    requiredSnippets: [
      "## Preconditions",
      "## Migration Strategy",
      "## Cutover Checklist",
      "## Acceptance Criteria",
      "## Post-Cutover Operations"
    ]
  },
  {
    path: "docs/migrations/runtime-state-backfill.md",
    requiredSnippets: [
      "## Inputs",
      "## Procedure",
      "## Validation",
      "## Failure Handling"
    ]
  },
  {
    path: "docs/migrations/rollback-runbook.md",
    requiredSnippets: [
      "## Rollback Triggers",
      "## Immediate Actions",
      "## Recovery Steps",
      "## Exit Criteria"
    ]
  }
];

const requiredExecutables = [
  "scripts/backfill-runtime-state.mjs"
];

const failures = [];

for (const doc of requiredDocs) {
  const absolutePath = path.join(workspaceRoot, doc.path);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required migration document: ${doc.path}`);
    continue;
  }

  const content = fs.readFileSync(absolutePath, "utf8");
  for (const snippet of doc.requiredSnippets) {
    if (!content.includes(snippet)) {
      failures.push(`Document ${doc.path} is missing required section: ${snippet}`);
    }
  }
}

for (const executablePath of requiredExecutables) {
  const absolutePath = path.join(workspaceRoot, executablePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`Missing required migration executable: ${executablePath}`);
  }
}

if (failures.length > 0) {
  console.error("Migration readiness verification failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log(
  `Migration readiness verification passed for ${requiredDocs.length} document(s) and ${requiredExecutables.length} executable(s).`
);
