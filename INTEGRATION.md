# Two-Step Integration

Use this when you want to embed the admin dashboard into an existing website as quickly as possible.

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
