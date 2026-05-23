# Two-Step Integration

Use this when you want to embed the admin dashboard into an existing website as quickly as possible.

## Zero-Code Sidecar Quickstart (Recommended)

For a plug-and-play rollout with minimal host code changes:

1. Add this repo as a submodule in your host project:

```bash
git submodule add https://github.com/Coding-Krakken/AdminDashboard.git admin-dashboard
git submodule update --init --recursive
```

2. Copy `templates/plug-and-play/env.sidecar.example` to your host `.env` file and adjust values.
3. Run the starter sidecar from `templates/plug-and-play/docker-compose.sidecar.yml`.
4. Route `/admin` and `/api/admin/*` to the sidecar using one of:
  - `templates/plug-and-play/reverse-proxy/nginx.admin-dashboard.conf`
  - `templates/plug-and-play/reverse-proxy/caddy.admin-dashboard.Caddyfile`
5. Validate readiness:

```bash
node admin-dashboard/scripts/verify-plug-and-play-readiness.mjs --base-url=http://localhost:3000 --strict-http
```

Optional one-command kit generation from your host repository root:

```bash
node admin-dashboard/scripts/bootstrap-plug-and-play.mjs --profile=generic --auth-provider=memory --proxy=both
```

Interactive mode:

```bash
node admin-dashboard/scripts/bootstrap-plug-and-play.mjs --interactive
```

Interactive mode requires a TTY terminal. For automation, pass explicit flags instead.

This generates `.admin-dashboard-kit/` with:
- `.env.admin-dashboard`
- `docker-compose.admin-dashboard.sidecar.yml`
- reverse proxy snippets (nginx/caddy based on `--proxy`)

This mode keeps your host app mostly unchanged while providing full admin UI + APIs.

## Step 1: Initialize dashboard once

Install packages:

```bash
npm install @universal-admin/core @universal-admin/adapters
```

Create a dashboard instance:

```ts
import { createDashboard } from "@universal-admin/core";
import { createEnvAuthAdapter } from "@universal-admin/adapters";

const dashboard = await createDashboard({
  authAdapter: createEnvAuthAdapter(),
  config: "env:ADMIN_DASHBOARD_CONFIG"
});
```

Set minimum environment values:

```bash
export ADMIN_DASHBOARD_CONFIG='{"modules":[],"flags":{},"rolePermissions":{}}'
export ADMIN_AUTH_PROVIDER=memory
```

`ADMIN_DASHBOARD_CONFIG` accepts dashboard config JSON. You can also pass a file path or inline object to `createDashboard`.

## Step 2: Use it in your app

Build model and render/nav from it:

```ts
const model = await dashboard.buildModel({ activeRoute: "/admin" });
console.log(model.shell.primaryNavigation);
```

You can also gate actions:

```ts
const canWriteSettings = dashboard.canAccess("settings:write");
```

## Next.js example

See [templates/next-app-integration.ts](templates/next-app-integration.ts).

## Express example

See [templates/express-integration.ts](templates/express-integration.ts).

## React embedded example

See [templates/react-embedded.tsx](templates/react-embedded.tsx).

## Config input options

- Object: `config: { modules, flags, rolePermissions }`
- Inline JSON: `config: '{"modules": ...}'`
- Env var pointer: `config: 'env:ADMIN_DASHBOARD_CONFIG'`
- File path: `config: './dashboard.config.json'`

## Auth helper environment options

The default env helper reads these values:

- `ADMIN_AUTH_PROVIDER` (`memory`, `nextauth`, `clerk`, or `anonymous`)
- `ADMIN_AUTH_USER_JSON` (full JSON user payload, highest priority)
- `ADMIN_AUTH_USER_ID`
- `ADMIN_AUTH_EMAIL`
- `ADMIN_AUTH_ROLE`
- `ADMIN_AUTH_TENANT_ID`
- `ADMIN_AUTH_PERMISSIONS` (comma-separated)

For production, you can replace `createEnvAuthAdapter()` with your own adapter implementation that reads request/session context.

## Optional auth provider detection

If your host app forwards mixed auth headers, use `detectAuthProvider` and `extractAuthUserFromHeaders` from `@universal-admin/adapters` to normalize inbound identity context.

## Environment matrix

| Variable | Required | Purpose |
| --- | --- | --- |
| `ADMIN_DASHBOARD_CONFIG` | Yes (if using `env:` config source) | Dashboard config JSON payload |
| `ADMIN_AUTH_PROVIDER` | Yes for env auth helper | Selects auth adapter mode (`memory`, `nextauth`, `clerk`, `anonymous`) |
| `ADMIN_AUTH_USER_JSON` | Optional | Full user payload override for local/dev testing |
| `ADMIN_AUTH_USER_ID` | Optional | User id fallback when JSON is not provided |
| `ADMIN_AUTH_EMAIL` | Optional | User email fallback |
| `ADMIN_AUTH_ROLE` | Optional | Role fallback |
| `ADMIN_AUTH_TENANT_ID` | Optional | Tenant binding fallback |
| `ADMIN_AUTH_PERMISSIONS` | Optional | Comma-separated permission fallback |

## Local verification checklist

Run these from repo root to validate integration behavior:

```bash
npm run typecheck
npm run test
npm run verify:config
npm run verify:generated
npm run verify:plugins
npm run verify:admin-policy
```

For endpoint compatibility checks in starter-next:

```bash
npm run test -- apps/starter-next/app/api/admin/__tests__/route-payload-compat.test.ts
```

## Troubleshooting

- `Invalid dashboard configuration`: validate `ADMIN_DASHBOARD_CONFIG` JSON shape (`modules`, `flags`, `rolePermissions`) and permission strings in `resource:action` format.
- `Access denied` for admin APIs: ensure the user policy includes route action permissions (`runtime:read`, `intelligence:read`, etc.) and tenant context if your host enforces tenant checks.
- Routes fail with `unknown runtime summary error`: verify auth adapter wiring first, then run `npm run verify:admin-policy` to ensure centralized authorization remains intact.
- Dashboard returns empty modules: check module `requiredPermissions` and `requiredFlags` against current user permissions and enabled flags.
