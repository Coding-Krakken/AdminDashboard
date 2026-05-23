# Runtime State Backfill Procedure

## Objective

Backfill starter runtime state and audit history into production adapters without disrupting live operations.

## Inputs

- Source files:
  - `apps/starter-next/.runtime-data.json`
  - `apps/starter-next/.runtime-audit.json`
- Target adapter environment variables and credentials.
- Tenant mapping rules when tenant metadata is incomplete.
- Backfill utility:
   - `node scripts/backfill-runtime-state.mjs --dry-run`

## Procedure

1. Create a point-in-time snapshot of source files.
2. Run schema and policy verification:
   - `npm run verify:config`
   - `npm run verify:admin-policy`
3. Parse source payloads and normalize records to tenant-scoped contracts.
4. Reject records that cannot be mapped to a valid tenant.
5. Write backfill batches in deterministic order:
   - settings and runtime context first
   - audit events second
6. Emit per-tenant counters:
   - scanned
   - written
   - skipped
   - failed
7. Run integrity checks:
   - record counts by tenant
   - checksum comparison per tenant
   - representative query validation
8. Store a signed backfill report artifact.

## Execution Commands

- Dry run (recommended first):
   - `npm run migrate:backfill-runtime`
- Full execution:
   - `node scripts/backfill-runtime-state.mjs --target-data artifacts/migrations/runtime-data.backfilled.json --target-audit artifacts/migrations/runtime-audit.backfilled.json --report artifacts/migrations/backfill-report.json`
- Strict tenant mapping mode:
   - `node scripts/backfill-runtime-state.mjs --dry-run --fail-on-unmapped`

The utility emits a deterministic report with per-tenant counters, checksums, and signature metadata.
Strict mode allows explicit default mapping rules for known legacy global runtime heartbeat records.

## Validation

- No failed records remain unresolved.
- Per-tenant totals match expected snapshot counts.
- Spot checks confirm timestamps and redaction behavior.
- Runtime APIs return expected data from adapter backend.

## Failure Handling

- If a batch fails, stop processing and retain cursor position.
- Fix mapping or schema issue.
- Resume from last committed cursor.
- If integrity checks fail after full run, execute rollback runbook.
