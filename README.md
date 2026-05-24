# Universal Admin Dashboard

Advanced implementation for a modular, multi-business admin dashboard platform.

## Workspace Layout

- `packages/core`: module registry, plugin runtime, layered feature flags, policy engine, and schema validation.
- `packages/theming`: theme token contract and host-theme merge utilities.
- `packages/adapters`: adapter contracts plus in-memory auth/data/realtime/audit implementations.
- `packages/ui`: navigation and shell composition helpers.
- `packages/cli`: module scaffolding CLI.
- `apps/starter-next`: Next.js App Router starter with static + runtime plugins and grouped module shell.

## Quick Start

1. Install dependencies: `npm install`
2. Run starter app: `npm run dev:starter`
3. Type-check all workspaces: `npm run typecheck`
4. Scaffold a module: `npm run scaffold:module -- --id=inventory --title=Inventory`
5. Run verification tests: `npm run test`
6. Verify runtime plugin signatures: `npm run verify:plugins`
7. Verify config consistency: `npm run verify:config`
8. Verify generated modules: `npm run verify:generated`
9. Verify admin API policy coverage: `npm run verify:admin-policy`

## Fast Integration

- For a two-step integration flow into an existing website, see `INTEGRATION.md`.

## Plug-and-Play Sidecar Kit

For near-zero host-code integration, use the sidecar kit in `templates/plug-and-play/`:

- `templates/plug-and-play/docker-compose.sidecar.yml`
- `templates/plug-and-play/env.sidecar.example`
- `templates/plug-and-play/reverse-proxy/nginx.admin-dashboard.conf`
- `templates/plug-and-play/reverse-proxy/caddy.admin-dashboard.Caddyfile`

Readiness check command:

```bash
npm run verify:plug-and-play -- --base-url=http://localhost:3000
```

Add `--strict-http` to fail the check when health/profile endpoints are not reachable.
Add `--admin-path=/admin --module-routes=crm,reporting,settings` to verify UI/module route readiness.

One-command kit generation:

```bash
npm run bootstrap:plug-and-play -- --profile=commerce --auth-provider=nextauth --proxy=nginx
```

Automatic profile recommendation from host signals:

```bash
npm run bootstrap:plug-and-play -- --profile=auto --profile-hints="checkout subscriptions work order"
```

Interactive generator mode:

```bash
npm run bootstrap:plug-and-play -- --interactive
```

Note: interactive mode requires a TTY terminal. For CI/automation use non-interactive flags.

This generates a ready-to-use kit under `.admin-dashboard-kit/` (env file, sidecar compose file, and reverse proxy config).
The generated kit also includes `theme.tokens.json` and `profile.recommendation.json` for branding and business-fit validation.

10. Verify migration readiness artifacts: `npm run verify:migration-readiness`
11. Run migration backfill dry-run: `npm run migrate:backfill-runtime`
12. Run SaaS smoke check against a deployment: `npm run verify:saas-smoke -- --base-url=https://your-saas-domain`

## SaaS Quick Start

Run the multi-tenant SaaS app locally:

1. Copy `apps/saas-next/.env.example` to `apps/saas-next/.env.local`
2. Run Prisma generate/migrate: `npm run db:generate && npm run db:migrate`
3. Start SaaS app: `npm run dev:saas`
4. Validate SaaS tests: `npm run test:saas`
5. Run endpoint smoke check: `npm run verify:saas-smoke -- --base-url=http://localhost:3000 --platform-secret=<secret>`

Operational runbook:

- `docs/saas-vercel-runbook.md`

## Implemented Highlights

- Hybrid plugin model: compile-time plugins plus runtime plugin registration.
- Strict plugin security: allowlist policy and HMAC signature verification.
- Key rotation support: plugins validate against primary and fallback signing keys.
- Layered feature flags: global, tenant, role, and user scopes.
- Role/permission policy helpers for route and module gating.
- Config schema validation using Zod.
- Adapter abstraction with starter implementations for auth, data, realtime polling, and audit sinks.
- File-backed persistence adapters for runtime context and audit logs.
- Prisma-compatible adapters for data and audit operations.
- Settings registry with per-module schemas and validated defaults.
- Token-first theming and host-theme inheritance.
- Starter dashboard with grouped navigation, module catalog, telemetry cards, and runtime flag visibility.

## Plugin Security

- Runtime plugin manifests require IDs that match the configured allowlist.
- Strict signature mode validates each plugin with HMAC SHA-256.
- Key rotation is supported using `signingSecret` plus `signingSecrets` fallback keys.
- Seed runtime plugins are pre-signed in `apps/starter-next/src/platform/runtime-plugins.json`.
- Generated plugins are signed by the CLI using:
	- `npm run scaffold:module -- --id=inventory --title=Inventory --secret=starter-signing-secret-v1`

## Runtime Persistence

- Starter runtime writes context snapshots to `apps/starter-next/.runtime-data.json`.
- Audit heartbeats/events are persisted to `apps/starter-next/.runtime-audit.json`.

## Governance Verification

- `npm run verify:config` validates that module-required permissions and flags are represented in config.
- `npm run verify:config` also validates generated module manifest requiredPermissions/requiredFlags against config.
- `npm run verify:generated` validates generated modules include required scaffold artifacts.
- `npm run verify:generated` also validates generated folder/manifests/schema module-id consistency.
- `npm run verify:plugins` validates runtime plus generated plugin allowlist and signatures (including signing-key rotation).
- `npm run verify:admin-policy` verifies all admin routes use centralized authorization and only declared policy actions.
- `npm run verify:migration-readiness` verifies migration playbooks include required preconditions, backfill, and rollback procedures.

## Migration Playbooks

- `docs/migrations/starter-to-saas-playbook.md`: end-to-end starter to SaaS migration and cutover plan.
- `docs/migrations/runtime-state-backfill.md`: deterministic data backfill procedure and integrity checks.
- `docs/migrations/rollback-runbook.md`: rollback triggers, immediate response actions, and recovery flow.
- `docs/saas-vercel-runbook.md`: SaaS deployment and verification workflow for Vercel.
- `scripts/backfill-runtime-state.mjs`: executable backfill utility with dry-run mode and signed report artifact output.

## Starter Admin APIs

- `GET /api/admin/runtime`: runtime summary (user, modules, plugin counts, plugin rollout matrix/summary, security, flags).
- `GET /api/admin/runtime?profile=<id>`: same runtime summary with a profile override (`generic`, `field-service`, `saas`, `commerce`).
- `GET /api/admin/health`: runtime health probe status and adapter latency checks.
- `GET /api/admin/intelligence?profile=<id>&windowDays=<3-30>`: consolidated live intelligence stream (windowed KPIs, historical trends, window-over-window comparison deltas, active alerts, prioritized recommendations/playbooks, daily risk matrix breakdown, top actors/actions/entities, category mix, audit pulse, policy and profile context).
- `GET /api/admin/audit?limit=<n>&action=<action>&entity=<entity>&actorId=<id>`: filtered admin audit events (requires `audit:read`).
- `GET /api/admin/audit/summary?deniedOnly=true&since=<iso>&until=<iso>`: aggregated audit counts for investigations.
- `GET /api/admin/profiles`: available business profile packs and forced-flag metadata.
- `GET /api/admin/policy`: effective admin API authorization matrix.
- `GET /api/admin/settings`: validated module settings snapshots.
- `POST /api/admin/settings`: update module settings with schema validation.
- `PATCH /api/admin/settings`: partial update for module settings.
- `DELETE /api/admin/settings`: reset module settings to defaults.
- `GET /api/admin/settings/[moduleId]`: module-specific settings snapshot.
- `POST /api/admin/settings/[moduleId]`: module-specific settings update.
- `PATCH /api/admin/settings/[moduleId]`: module-specific partial update.
- `DELETE /api/admin/settings/[moduleId]`: module-specific reset to defaults.

Settings API access rules:
- Read endpoints require an authenticated user.
- Mutation endpoints deny `viewer` role and require `settings:write`.
- Module-scoped settings endpoints also require module access under current profile, flags, and permissions.

Centralized API authorization:
- Admin route authorization is defined in a central policy matrix in `apps/starter-next/src/platform/admin-api-policy.ts`.
- Routes use shared authorization helpers to enforce consistent 401/403/404 behavior.
- Settings mutation endpoints emit audit events (`settings.update`, `settings.patch`, `settings.reset`).
- Authorization failures emit `authz.denied` audit events with reason/status metadata.
- Audit list and summary endpoints support `since`/`until` and `deniedOnly` filters.
- Audit reads apply retention window (`audit.retentionDays`) and sensitive metadata redaction (`audit.redactSensitiveFields`).
- `recordAdminAuditEvent` preserves caller `metadata.at` when provided and stamps current ISO time otherwise.
- Audit endpoints return HTTP 400 for invalid ISO timestamps or inverted `since`/`until` ranges.

SSR auth parity:
- Dashboard and module pages pass incoming request headers into runtime model resolution.
- This keeps server-rendered UI access checks aligned with request-scoped JWT/NextAuth/Clerk context used by admin APIs.

## Auth Adapter Selection

- Set `ADMIN_AUTH_PROVIDER=memory|jwt|nextauth|clerk` to switch starter auth adapter.
- Optional `ADMIN_AUTH_ROLE` sets the simulated role for provider mocks.
- For `jwt`, send `Authorization: Bearer <token>` with claims (`sub`, `email`, `role`, `tenantId`, `permissions`).
- Set `ADMIN_AUTH_JWT_SECRET` to enforce HS256 signature validation for bearer tokens.

Admin runtime API access rules:
- `/api/admin/runtime`, `/api/admin/health`, `/api/admin/profiles`, and `/api/admin/intelligence` require authenticated users with `dashboard:read` (or wildcard permission).

## Business Profile Packs

- Set `ADMIN_BUSINESS_PROFILE=generic|field-service|saas|commerce`.
- Profiles shape visible modules and can force specific feature-flag overrides.
- UI and runtime API also support per-request profile override with the `profile` query param.
- Runtime/generated extension modules are included across profiles unless blocked by permissions or flags.

## Generated Module Settings Auto-Registration

- Any generated module with `settings.schema.json` in `src/platform/generated/<moduleId>/` is auto-registered at runtime in the settings registry.
- Supported JSON schema property types: `string`, `number`, `integer`, `boolean`, `array`, and nested `object`.
- Generated module required permissions must be explicitly mapped in non-owner roles to satisfy config governance checks.

## Settings Schemas

- Module settings schemas are registered in `apps/starter-next/src/platform/settings.ts`.
- Defaults are validated at startup and rendered in the starter dashboard.
