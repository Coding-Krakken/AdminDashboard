# Starter to SaaS Migration Playbook

## Objective

Move from starter mode (file-backed runtime state, local operational assumptions) to production SaaS mode (durable adapter-backed storage, tenant-safe operations, verified rollout controls) with a reversible, low-risk cutover.

## Preconditions

- `npm run typecheck` passes in the target release commit.
- `npm run test` passes in the target release commit.
- `npm run verify:admin-policy` passes in the target release commit.
- `npm run verify:plugins` passes in the target release commit.
- `npm run verify:migration-readiness` passes in the target release commit.
- Production secrets are configured:
  - `PLUGIN_SIGNING_SECRET`
  - `PLUGIN_SIGNING_SECRETS` (optional for rotation)
  - authentication provider secrets
  - data adapter credentials

## Migration Strategy

1. Prepare production adapters while keeping file-backed starter state as source-of-truth.
2. Run dry-run backfill and validate tenant-level record parity.
3. Enable dual-write mode for runtime state and audit events.
4. Observe stability and SLOs during soak window.
5. Cut reads from file-backed state to adapter-backed state.
6. Keep rollback switch available until post-cutover acceptance window completes.

## Cutover Checklist

1. Freeze non-critical configuration changes.
2. Capture baseline metrics for error rate, p95 latency, stale intelligence lag, and alert delivery success.
3. Run backfill procedure from [runtime-state-backfill.md](runtime-state-backfill.md).
4. Enable dual-write gate and confirm no write failures in logs.
5. Validate runtime API:
   - plugin compatibility matrix present
   - plugin rollout decisions present
   - health endpoint reports ready
6. Shift read path to adapter-backed data.
7. Keep rollback controls armed for the defined acceptance window.

## Acceptance Criteria

- No cross-tenant data leakage in validation samples.
- No lost updates during concurrent writes.
- Runtime health status remains healthy.
- SLO thresholds remain release-ready for the acceptance window.
- Admin policy verification remains unchanged.

## Post-Cutover Operations

- Keep dual-write enabled for one release cycle.
- Reconcile file-backed and adapter-backed checksums daily until decommission.
- Archive file-backed runtime artifacts after formal sign-off.
- Remove fallback paths only after two stable releases.
