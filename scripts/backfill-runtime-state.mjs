#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const workspaceRoot = path.resolve(process.cwd());

function parseArgs(argv) {
  const options = {
    sourceData: path.join(workspaceRoot, "apps/starter-next/.runtime-data.json"),
    sourceAudit: path.join(workspaceRoot, "apps/starter-next/.runtime-audit.json"),
    targetData: path.join(workspaceRoot, "artifacts/migrations/runtime-data.backfilled.json"),
    targetAudit: path.join(workspaceRoot, "artifacts/migrations/runtime-audit.backfilled.json"),
    report: path.join(workspaceRoot, "artifacts/migrations/backfill-report.json"),
    tenantDefault: "default-tenant",
    dryRun: false,
    failOnUnmapped: false
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--help" || arg === "-h") {
      options.help = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--fail-on-unmapped") {
      options.failOnUnmapped = true;
      continue;
    }

    if (!arg.startsWith("--")) {
      throw new Error(`Unknown argument '${arg}'.`);
    }

    const key = arg.slice(2);
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`Flag '${arg}' requires a value.`);
    }

    index += 1;
    if (key === "source-data") options.sourceData = path.resolve(value);
    else if (key === "source-audit") options.sourceAudit = path.resolve(value);
    else if (key === "target-data") options.targetData = path.resolve(value);
    else if (key === "target-audit") options.targetAudit = path.resolve(value);
    else if (key === "report") options.report = path.resolve(value);
    else if (key === "tenant-default") options.tenantDefault = value.trim();
    else throw new Error(`Unknown flag '--${key}'.`);
  }

  if (!options.tenantDefault) {
    throw new Error("--tenant-default must be a non-empty value.");
  }

  return options;
}

function printHelp() {
  console.log(`Runtime state backfill utility

Usage:
  node scripts/backfill-runtime-state.mjs [options]

Options:
  --source-data <path>       Source runtime data JSON
  --source-audit <path>      Source runtime audit JSON
  --target-data <path>       Target normalized data JSON
  --target-audit <path>      Target normalized audit JSON
  --report <path>            Backfill report artifact path
  --tenant-default <id>      Default tenant for unmapped records
  --dry-run                  Do not write target files
  --fail-on-unmapped         Fail if any record is missing tenant mapping
  --help                     Show this help
`);
}

function readJsonFile(filePath, fallback) {
  if (!fs.existsSync(filePath)) {
    return fallback;
  }

  const raw = fs.readFileSync(filePath, "utf8");
  return JSON.parse(raw);
}

function writeJsonFile(filePath, payload) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((entry) => stableStringify(entry)).join(",")}]`;
  }

  const objectValue = value;
  const keys = Object.keys(objectValue).sort();
  return `{${keys
    .map((key) => `${JSON.stringify(key)}:${stableStringify(objectValue[key])}`)
    .join(",")}}`;
}

function sha256(input) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function hmacSha256(input, secret) {
  return crypto.createHmac("sha256", secret).update(input).digest("hex");
}

function parseTimestampMs(value) {
  if (typeof value !== "string") {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? 0 : parsed;
}

function deriveTenantFromDataKey(key) {
  const parts = key.split(":");
  if (parts.length < 3) {
    return { baseKey: key, tenantId: null };
  }

  return {
    baseKey: parts.slice(0, -1).join(":"),
    tenantId: parts[parts.length - 1]
  };
}

function isDefaultMappableRuntimeDataKey(sourceKey) {
  return sourceKey === "runtime:healthProbe" || sourceKey === "runtime:lastContext";
}

function isDefaultMappableAuditEvent(event) {
  return (
    event.actorId === "runtime-health" &&
    event.action === "health.check" &&
    event.entity === "runtime"
  );
}

function createTenantCounters() {
  return {
    scanned: 0,
    written: 0,
    skipped: 0,
    failed: 0
  };
}

const MAX_FAILURE_MESSAGES = 100;

function appendFailure(failures, message) {
  if (failures.length < MAX_FAILURE_MESSAGES) {
    failures.push(message);
  }
}

function incrementCounter(perTenant, tenantId, counter) {
  if (!perTenant[tenantId]) {
    perTenant[tenantId] = createTenantCounters();
  }

  perTenant[tenantId][counter] += 1;
}

function normalizeRuntimeData(runtimeData, options, failures) {
  const records = Object.entries(runtimeData)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceKey, value]) => ({ sourceKey, value }));

  const deduped = new Map();
  const perTenant = {};
  let scanned = 0;
  let skipped = 0;
  let failed = 0;

  for (const record of records) {
    scanned += 1;

    const fromKey = deriveTenantFromDataKey(record.sourceKey);
    const objectValue =
      record.value && typeof record.value === "object" && !Array.isArray(record.value)
        ? record.value
        : null;
    const tenantFromPayload =
      objectValue && typeof objectValue.tenantId === "string"
        ? objectValue.tenantId
        : null;

    const candidateTenant = tenantFromPayload ?? fromKey.tenantId ?? null;
    const tenantId = candidateTenant || options.tenantDefault;

    if (
      !candidateTenant &&
      options.failOnUnmapped &&
      !isDefaultMappableRuntimeDataKey(record.sourceKey)
    ) {
      failed += 1;
      incrementCounter(perTenant, options.tenantDefault, "failed");
      appendFailure(
        failures,
        `Unmapped runtime data key '${record.sourceKey}' is missing tenant metadata.`
      );
      continue;
    }

    incrementCounter(perTenant, tenantId, "scanned");

    const baseKey = fromKey.baseKey;
    const dedupeKey = `${tenantId}|${baseKey}`;
    const candidate = {
      tenantId,
      key: `${baseKey}:${tenantId}`,
      baseKey,
      value: record.value,
      sourceKey: record.sourceKey,
      priority: tenantFromPayload ? 2 : fromKey.tenantId ? 1 : 0,
      updatedAtMs: parseTimestampMs(
        objectValue && typeof objectValue.at === "string" ? objectValue.at : undefined
      )
    };

    const existing = deduped.get(dedupeKey);
    if (!existing) {
      deduped.set(dedupeKey, candidate);
      continue;
    }

    const isHigherPriority =
      candidate.priority > existing.priority ||
      (candidate.priority === existing.priority &&
        candidate.updatedAtMs > existing.updatedAtMs) ||
      (candidate.priority === existing.priority &&
        candidate.updatedAtMs === existing.updatedAtMs &&
        candidate.sourceKey.localeCompare(existing.sourceKey) > 0);

    skipped += 1;
    incrementCounter(perTenant, tenantId, "skipped");
    if (isHigherPriority) {
      deduped.set(dedupeKey, candidate);
    }
  }

  const normalized = Array.from(deduped.values()).sort((left, right) => {
    if (left.tenantId !== right.tenantId) {
      return left.tenantId.localeCompare(right.tenantId);
    }

    return left.key.localeCompare(right.key);
  });

  for (const entry of normalized) {
    incrementCounter(perTenant, entry.tenantId, "written");
  }

  const targetObject = {};
  for (const entry of normalized) {
    targetObject[entry.key] = entry.value;
  }

  return {
    normalized,
    targetObject,
    summary: {
      scanned,
      written: normalized.length,
      skipped,
      failed
    },
    perTenant
  };
}

function eventFingerprint(event) {
  return sha256(stableStringify(event));
}

function normalizeAuditEvents(runtimeAudit, options, failures) {
  const events = Array.isArray(runtimeAudit?.events) ? runtimeAudit.events : [];
  const perTenant = {};
  let scanned = 0;
  let failed = 0;

  const normalized = [];

  for (const event of events) {
    scanned += 1;

    const objectEvent =
      event && typeof event === "object" && !Array.isArray(event) ? event : null;
    if (!objectEvent) {
      failed += 1;
      incrementCounter(perTenant, options.tenantDefault, "failed");
      appendFailure(failures, "Encountered non-object audit event entry.");
      continue;
    }

    const metadata =
      objectEvent.metadata &&
      typeof objectEvent.metadata === "object" &&
      !Array.isArray(objectEvent.metadata)
        ? objectEvent.metadata
        : {};

    const tenantCandidate =
      typeof metadata.tenantId === "string"
        ? metadata.tenantId
        : typeof objectEvent.tenantId === "string"
          ? objectEvent.tenantId
          : null;

    const tenantId = tenantCandidate || options.tenantDefault;
    if (
      !tenantCandidate &&
      options.failOnUnmapped &&
      !isDefaultMappableAuditEvent(objectEvent)
    ) {
      failed += 1;
      incrementCounter(perTenant, options.tenantDefault, "failed");
      appendFailure(
        failures,
        `Unmapped audit event '${String(objectEvent.action ?? "unknown")}' is missing tenant metadata.`
      );
      continue;
    }

    incrementCounter(perTenant, tenantId, "scanned");

    normalized.push({
      ...objectEvent,
      metadata: {
        ...metadata,
        tenantId
      },
      tenantId
    });
  }

  normalized.sort((left, right) => {
    const leftAt = parseTimestampMs(
      left.metadata && typeof left.metadata.at === "string" ? left.metadata.at : undefined
    );
    const rightAt = parseTimestampMs(
      right.metadata && typeof right.metadata.at === "string" ? right.metadata.at : undefined
    );

    if (leftAt !== rightAt) {
      return leftAt - rightAt;
    }

    if (left.tenantId !== right.tenantId) {
      return String(left.tenantId).localeCompare(String(right.tenantId));
    }

    return eventFingerprint(left).localeCompare(eventFingerprint(right));
  });

  for (const entry of normalized) {
    incrementCounter(perTenant, entry.tenantId, "written");
  }

  return {
    normalized,
    summary: {
      scanned,
      written: normalized.length,
      skipped: 0,
      failed
    },
    perTenant
  };
}

function mergeBackfillOutput(existingDataObject, existingAuditObject, normalizedData, normalizedAudit) {
  const mergedData = {
    ...existingDataObject
  };

  for (const entry of normalizedData) {
    mergedData[entry.key] = entry.value;
  }

  const existingEvents = Array.isArray(existingAuditObject?.events)
    ? existingAuditObject.events
    : [];

  const eventMap = new Map();
  for (const event of [...existingEvents, ...normalizedAudit]) {
    eventMap.set(eventFingerprint(event), event);
  }

  const mergedEvents = Array.from(eventMap.values()).sort((left, right) =>
    eventFingerprint(left).localeCompare(eventFingerprint(right))
  );

  return {
    mergedData,
    mergedAudit: {
      events: mergedEvents
    }
  };
}

function calculateTenantChecksums(normalizedData, normalizedAudit) {
  const byTenantData = {};
  const byTenantAudit = {};

  for (const entry of normalizedData) {
    if (!byTenantData[entry.tenantId]) {
      byTenantData[entry.tenantId] = [];
    }

    byTenantData[entry.tenantId].push({ key: entry.key, value: entry.value });
  }

  for (const entry of normalizedAudit) {
    const tenantId = String(entry.tenantId ?? "unknown");
    if (!byTenantAudit[tenantId]) {
      byTenantAudit[tenantId] = [];
    }

    byTenantAudit[tenantId].push(entry);
  }

  const checksums = {};
  const tenantIds = new Set([...Object.keys(byTenantData), ...Object.keys(byTenantAudit)]);
  for (const tenantId of Array.from(tenantIds).sort()) {
    checksums[tenantId] = {
      dataChecksum: sha256(stableStringify(byTenantData[tenantId] ?? [])),
      auditChecksum: sha256(stableStringify(byTenantAudit[tenantId] ?? [])),
      dataCount: (byTenantData[tenantId] ?? []).length,
      auditCount: (byTenantAudit[tenantId] ?? []).length
    };
  }

  return checksums;
}

function mergeTenantCounters(left, right) {
  const merged = { ...left };
  for (const [tenantId, counters] of Object.entries(right)) {
    const current = merged[tenantId] ?? createTenantCounters();
    merged[tenantId] = {
      scanned: current.scanned + counters.scanned,
      written: current.written + counters.written,
      skipped: current.skipped + counters.skipped,
      failed: current.failed + counters.failed
    };
  }

  return merged;
}

function runBackfill(options) {
  const failures = [];
  const runtimeData = readJsonFile(options.sourceData, {});
  const runtimeAudit = readJsonFile(options.sourceAudit, { events: [] });

  const normalizedData = normalizeRuntimeData(runtimeData, options, failures);
  const normalizedAudit = normalizeAuditEvents(runtimeAudit, options, failures);

  if (failures.length > 0 && options.failOnUnmapped) {
    return {
      ok: false,
      failures,
      normalizedData,
      normalizedAudit
    };
  }

  const existingTargetData = readJsonFile(options.targetData, {});
  const existingTargetAudit = readJsonFile(options.targetAudit, { events: [] });

  const merged = mergeBackfillOutput(
    existingTargetData,
    existingTargetAudit,
    normalizedData.normalized,
    normalizedAudit.normalized
  );

  if (!options.dryRun) {
    writeJsonFile(options.targetData, merged.mergedData);
    writeJsonFile(options.targetAudit, merged.mergedAudit);
  }

  const report = {
    createdAt: new Date().toISOString(),
    dryRun: options.dryRun,
    source: {
      data: options.sourceData,
      audit: options.sourceAudit
    },
    target: {
      data: options.targetData,
      audit: options.targetAudit
    },
    options: {
      tenantDefault: options.tenantDefault,
      failOnUnmapped: options.failOnUnmapped
    },
    summary: {
      data: normalizedData.summary,
      audit: normalizedAudit.summary,
      totalFailures: failures.length
    },
    perTenant: mergeTenantCounters(normalizedData.perTenant, normalizedAudit.perTenant),
    checksums: calculateTenantChecksums(
      normalizedData.normalized,
      normalizedAudit.normalized
    ),
    failures,
    failuresTruncated: failures.length >= MAX_FAILURE_MESSAGES
  };

  const signingKey =
    process.env.MIGRATION_REPORT_SIGNING_KEY ?? process.env.PLUGIN_SIGNING_SECRET ?? null;

  const signingPayload = stableStringify(report);
  report.signature = signingKey
    ? {
        algorithm: "HMAC-SHA256",
        source: process.env.MIGRATION_REPORT_SIGNING_KEY
          ? "MIGRATION_REPORT_SIGNING_KEY"
          : "PLUGIN_SIGNING_SECRET",
        value: hmacSha256(signingPayload, signingKey)
      }
    : {
        algorithm: "SHA256",
        source: "none",
        value: sha256(signingPayload)
      };

  writeJsonFile(options.report, report);

  return {
    ok: true,
    report,
    normalizedData,
    normalizedAudit
  };
}

function main() {
  let options;
  try {
    options = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  if (options.help) {
    printHelp();
    process.exit(0);
  }

  try {
    const result = runBackfill(options);

    if (!result.ok) {
      console.error("Runtime backfill failed:");
      for (const failure of result.failures) {
        console.error(`- ${failure}`);
      }
      if (result.normalizedData.summary.failed + result.normalizedAudit.summary.failed > result.failures.length) {
        console.error(
          `- Additional failures omitted: ${(result.normalizedData.summary.failed + result.normalizedAudit.summary.failed) - result.failures.length}`
        );
      }
      process.exit(1);
    }

    const dataSummary = result.report.summary.data;
    const auditSummary = result.report.summary.audit;
    console.log(
      `Runtime backfill ${options.dryRun ? "dry-run" : "completed"}: data written ${dataSummary.written}/${dataSummary.scanned}, audit written ${auditSummary.written}/${auditSummary.scanned}.`
    );
    console.log(`Backfill report written to ${options.report}.`);
  } catch (error) {
    console.error(
      error instanceof Error ? `Runtime backfill failed: ${error.message}` : String(error)
    );
    process.exit(1);
  }
}

main();
