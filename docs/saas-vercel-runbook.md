# SaaS Vercel Deployment Runbook

## Objective

Deploy `apps/saas-next` as the multi-tenant SaaS control plane while keeping `apps/starter-next` available as the self-hosted path.

This deployment supports two onboarding access methods:

- Custom domain/subdomain onboarding (DNS verification)
- Platform API route alias onboarding (`/api/platform/route/{tenantId}`) for free `*.vercel.app` project URLs

## Prerequisites

- Vercel project created with root directory `apps/saas-next`.
- Postgres database available (Vercel Postgres or Neon).
- Platform provisioning secret generated for bearer auth.

## Required Environment Variables

Set these in Vercel project settings:

- `DATABASE_URL`
- `DIRECT_URL`
- `PLATFORM_ADMIN_SECRET`

Optional domain automation variables:

- `VERCEL_API_TOKEN`
- `VERCEL_PROJECT_ID`
- `VERCEL_TEAM_ID`

Optional rate limiting overrides:

- `PLATFORM_API_RATE_LIMIT_MAX` (default `120`)
- `PLATFORM_API_RATE_LIMIT_WINDOW_MS` (default `60000`)

Local template reference: `apps/saas-next/.env.local.example`
Compatibility example: `apps/saas-next/.env.example`

## Local Readiness Validation

From workspace root:

1. `npm run typecheck:saas`
2. `npm run test:saas`
3. `npm run test`
4. `npm run verify:saas-smoke -- --base-url=<deployment-url> --platform-secret=<secret>`

## Database Workflow

From workspace root:

1. Generate Prisma client: `npm run db:generate`
2. Apply schema migration in managed environments: `npm run db:migrate`
3. Seed initial data where needed: `npm run db:seed`

For non-migration workflows (preview/dev), use `npm run db:push`.

## Deployment Steps

1. Push branch and trigger Vercel deployment for `apps/saas-next`.
2. Confirm build uses `prisma generate && next build` from `apps/saas-next/vercel.json`.
3. Validate health endpoint: `GET /api/platform/health`.
4. Validate OpenAPI contract: `GET /api/platform/openapi`.
5. Create a tenant via `POST /api/platform/tenants` using `Authorization: Bearer <PLATFORM_ADMIN_SECRET>`.
6. Add domain via `POST /api/platform/tenants/{id}/domains` and verify via `POST /api/platform/tenants/{id}/domains/{domainId}/verify`.

## Runtime Behavior Checks

- Known platform hosts and platform paths route to platform mode.
- Custom hosts route to tenant mode with normalized hostname.
- Tenant alias paths (`/api/platform/route/{tenantId}`) rewrite to tenant routes and resolve tenant context by `x-tenant-id`.
- Unknown tenant-host requests in tenant mode return 404.

## Automated Smoke Verification

The smoke checker validates this sequence:

1. `GET /api/platform/health`
2. `GET /api/platform/openapi`
3. `POST /api/platform/tenants`
4. `POST /api/platform/tenants/{id}/domains`
5. `POST /api/platform/tenants/{id}/domains/{domainId}/verify`
6. `DELETE /api/platform/tenants/{id}` (cleanup by default)

Alias-mode verification (manual):

1. Create tenant with `POST /api/platform/tenants`
2. Generate alias-only onboarding metadata with `POST /api/platform/tenants/{id}/domains` and body `{ "accessStrategy": "api-alias" }`
3. Open `/api/platform/route/{tenantId}` and confirm tenant dashboard renders

Useful flags:

- `--no-cleanup` keeps test tenant/domain records for manual inspection.
- `--no-provisioning` runs read-only checks (health + openapi) when write access is unavailable.

## Rollback Strategy

1. Re-point traffic to previous Vercel deployment.
2. Keep `apps/starter-next` self-hosted path available as fallback.
3. If data migration concerns exist, follow:
   - `docs/migrations/rollback-runbook.md`
   - `docs/migrations/starter-to-saas-playbook.md`

## Ongoing Operations

- Keep `npm run test` and `npm run test:saas` in CI gates.
- CI also runs `verify:saas-smoke` in provisioning mode against an ephemeral Postgres-backed SaaS app boot.
- Monitor platform route 401/429 patterns for auth and rate-limit drift.
- Re-run `npm run verify:migration-readiness` before any migration-phase release.
