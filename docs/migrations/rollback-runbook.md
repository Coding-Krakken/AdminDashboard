# Rollback Runbook

## Objective

Provide deterministic rollback steps when migration or cutover introduces instability, integrity risk, or policy regressions.

## Rollback Triggers

- SLO breach sustained beyond incident threshold.
- Cross-tenant data exposure risk detected.
- Elevated write conflicts or failed mutations.
- Runtime health status degraded with no mitigation.
- Plugin compatibility or rollout matrix regressions in production runtime API.

## Immediate Actions

1. Announce incident and freeze non-essential deploys.
2. Disable read-from-adapter gate and revert to file-backed reads.
3. Keep write path in safe mode based on incident severity:
   - preferred: file-only writes
   - optional: dual-write with adapter writes marked best-effort
4. Verify admin route authorization policy still passes.

## Recovery Steps

1. Capture incident timeline and failing request samples.
2. Compare adapter and file-backed state checksums for affected tenants.
3. Restore adapter state from pre-cutover snapshot when needed.
4. Re-run targeted backfill for affected tenant scopes.
5. Validate runtime health and SLO gates before reattempting cutover.

## Exit Criteria

- Incident root cause documented.
- Tenant parity and integrity checks are clean.
- SLOs return to release-ready state.
- Stakeholders approve re-entry to migration plan.

## Communication Template

- Impacted tenants:
- Duration:
- User-visible symptoms:
- Mitigation status:
- Next update time:
