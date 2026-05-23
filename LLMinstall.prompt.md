# Universal Admin Dashboard — Zero-Code Plug-and-Play Integration Prompt

You are an autonomous integration engineer. Integrate the pre-built Universal Admin Dashboard into a host repository with the least custom code possible.

Critical rule: do not regenerate dashboard features. This repo already provides modules, APIs, plugin runtime, feature flags, auth adapters, and starter UI.

---

## Architecture Facts (Treat as Source of Truth)

- Core packages:
  - `@universal-admin/core`
  - `@universal-admin/adapters`
  - `@universal-admin/ui`
  - `@universal-admin/theming`
- Pre-built Next.js reference app:
  - `apps/starter-next`
- Module packs / business profiles are already implemented in:
  - `apps/starter-next/src/platform/module-packs.ts`
  - Profiles: `generic`, `field-service`, `saas`, `commerce`
- Feature flag resolution is already implemented in:
  - `packages/core/src/flags.ts`
- Plugin runtime is already implemented in:
  - `packages/core/src/plugin-runtime.ts`
- Starter runtime wiring is already implemented in:
  - `apps/starter-next/src/platform/runtime.ts`

Do not invent package names that do not exist. Example: `@universal-admin/starter` does not exist.

---

## Mission

When complete, the host repo must have:
1. AdminDashboard added as a git submodule at `./admin-dashboard/`
2. Universal Admin packages installable/resolvable from the submodule
3. Admin mounted with one of the supported deployment modes (prefer no-code mode first)
4. Business profile selection working (`ADMIN_BUSINESS_PROFILE`)
5. Auth provider selection working (`ADMIN_AUTH_PROVIDER`)
6. Verified admin endpoints responding
7. Repeatable setup (`git clone --recurse-submodules` works)

---

## Non-Negotiable Rules

1. Do not reimplement the 21 modules manually.
2. Do not scaffold fake/stub APIs if starter APIs are available.
3. If package resolution fails, stop and output a blocked report with exact command output.
4. Always include verification evidence.
5. Preserve host repo conventions and existing lint/type/build scripts.

---

## Integration Mode Selection

Choose the first mode that fits the host constraints.

### Mode A (Preferred): Sidecar Starter App + Reverse Proxy

Use this when the host should stay untouched as much as possible.

- Run `admin-dashboard/apps/starter-next` as a separate process.
- Proxy host `/admin` and `/api/admin/*` to sidecar.
- Pros: near-zero host code changes, fastest time-to-value.
- Cons: two app processes.
- Use provided templates for speed:
  - `admin-dashboard/templates/plug-and-play/docker-compose.sidecar.yml`
  - `admin-dashboard/templates/plug-and-play/reverse-proxy/nginx.admin-dashboard.conf`
  - `admin-dashboard/templates/plug-and-play/reverse-proxy/caddy.admin-dashboard.Caddyfile`

### Mode B: Embedded Package Integration

Use this when admin must run inside host runtime/process.

- Install packages from submodule paths.
- Create one host route that calls `createDashboard(...)`.
- Optionally add selected starter API handlers.
- Pros: single process and full host control.
- Cons: more host wiring than Mode A.

### Mode C: Starter Fork-in-Place

Use this when heavy visual/behavior customization is required.

- Copy or fork `apps/starter-next` into host monorepo.
- Keep `@universal-admin/*` packages linked from submodule.

---

## Step-by-Step Implementation

### Step 0: Detect Host Platform

Detect and record:
- Framework (Next.js, Express, Remix, Astro, SvelteKit, Vite React, etc.)
- Package manager (npm/pnpm/yarn/bun)
- Existing auth system
- Existing reverse proxy/router capability

### Step 1: Add Submodule

```bash
git submodule add https://github.com/Coding-Krakken/AdminDashboard.git admin-dashboard
git submodule update --init --recursive
```

If `admin-dashboard` already exists, run:

```bash
git submodule update --init --recursive --remote admin-dashboard
```

### Step 2: Link Packages

Preferred for most hosts:

```bash
npm install ./admin-dashboard/packages/core ./admin-dashboard/packages/adapters ./admin-dashboard/packages/ui ./admin-dashboard/packages/theming
```

Expected dependency entries:

```json
{
  "dependencies": {
    "@universal-admin/core": "file:admin-dashboard/packages/core",
    "@universal-admin/adapters": "file:admin-dashboard/packages/adapters",
    "@universal-admin/ui": "file:admin-dashboard/packages/ui",
    "@universal-admin/theming": "file:admin-dashboard/packages/theming"
  }
}
```

### Step 3: Verify Package Resolution

```bash
node -e "require.resolve('@universal-admin/core'); require.resolve('@universal-admin/adapters'); require.resolve('@universal-admin/ui'); require.resolve('@universal-admin/theming'); console.log('RESOLUTION_OK')"
```

If this fails, stop and issue a blocked report.

### Step 4: Configure Runtime Environment

Set minimum environment:

```bash
# Business profile from starter runtime:
# generic | field-service | saas | commerce
ADMIN_BUSINESS_PROFILE=generic

# Auth adapter mode from starter runtime:
# memory | nextauth | clerk | jwt
ADMIN_AUTH_PROVIDER=memory

# Dev identity when using memory auth
ADMIN_AUTH_USER_ID=dev-admin
ADMIN_AUTH_ROLE=admin
ADMIN_AUTH_EMAIL=admin@localhost
```

Important:
- `ADMIN_BUSINESS_PROFILE` and `ADMIN_AUTH_PROVIDER` are read by `apps/starter-next/src/platform/runtime.ts`.
- `ADMIN_DASHBOARD_CONFIG` is used when integrating directly with `createDashboard(...)` config resolvers.

Optional one-command asset generation (from host repo root):

```bash
node admin-dashboard/scripts/bootstrap-plug-and-play.mjs --profile=generic --auth-provider=memory --proxy=both
```

Interactive mode:

```bash
node admin-dashboard/scripts/bootstrap-plug-and-play.mjs --interactive
```

Interactive mode requires a TTY terminal. For automation/CI, use explicit flags instead.

This produces `.admin-dashboard-kit/` with environment, sidecar compose, and proxy snippets.

### Step 5: Mount Admin (Pick One)

#### Option 5A: Sidecar (Mode A)

Start starter app:

```bash
npm run dev -w @universal-admin/starter-next
```

Proxy host routes:
- `/admin` -> sidecar `http://localhost:<starter-port>/`
- `/api/admin/*` -> sidecar `http://localhost:<starter-port>/api/admin/*`

#### Option 5B: Embedded Next.js Route (Mode B)

Create a host server route/page using only published package exports:

```tsx
import { createDashboard } from "@universal-admin/core";
import { createEnvAuthAdapter } from "@universal-admin/adapters";

const dashboard = await createDashboard({
  authAdapter: createEnvAuthAdapter(),
  config: "env:ADMIN_DASHBOARD_CONFIG"
});

export default async function AdminPage() {
  const model = await dashboard.buildModel({ activeRoute: "/admin" });

  return (
    <main>
      <nav>
        {model.shell.primaryNavigation.map((item) => (
          <a key={item.id} href={`/admin${item.route}`}>{item.label ?? item.id}</a>
        ))}
      </nav>
    </main>
  );
}
```

Do not import `@universal-admin/starter`.

#### Option 5C: Reuse Starter Route Handlers

If host is Next.js and path conventions match, reuse handlers from:
- `admin-dashboard/apps/starter-next/app/api/admin/**`

Prefer explicit file imports or proxying over broad symlink tricks that overwrite host app folders.

### Step 6: Business Profile Mapping

Use one of these values:

- `generic`: all core modules
- `field-service`: service-heavy pack, billing reduced
- `saas`: subscription/software-oriented pack
- `commerce`: commerce modules plus integrations/notifications

Auto-detection signals:
- `commerce`: Product/Order/SKU/cart/Shopify/Stripe checkout
- `saas`: Subscription/Plan/Usage/billing portal
- `field-service`: Appointment/Technician/Dispatch/WorkOrder
- fallback: `generic`

### Step 7: Verification

Run and capture outputs:

```bash
# submodule integrity
git submodule status | grep admin-dashboard

# package resolution
node -e "require.resolve('@universal-admin/core'); require.resolve('@universal-admin/adapters'); console.log('PACKAGES_OK')"

# host checks
npm run typecheck --if-present
npm run build --if-present

# runtime checks (adjust base URL/port)
curl -sSf http://localhost:3000/api/admin/health >/dev/null && echo HEALTH_OK
curl -sSf http://localhost:3000/api/admin/profiles >/dev/null && echo PROFILES_OK

# full readiness checker (portable from host repo root)
node admin-dashboard/scripts/verify-plug-and-play-readiness.mjs --base-url=http://localhost:3000 --strict-http
```

---

## Feature Flags and Overrides

- Core flag layering is already implemented (global/tenant/role/user).
- Prefer business profile first, then only add targeted overrides.
- If overrides are needed, apply them in host config payload passed to `createDashboard(...)`, or by extending starter runtime config logic in a controlled patch.

Do not hardcode per-tenant hacks directly in route handlers.

---

## Auth Wiring Guidance

Supported starter auth modes:
- `memory`
- `nextauth`
- `clerk`
- `jwt`

For production with custom identity provider, implement `AuthAdapter` and pass it to `createDashboard(...)`.

```ts
import { createDashboard } from "@universal-admin/core";
import type { AuthAdapter } from "@universal-admin/adapters";

const authAdapter: AuthAdapter = {
  async getUser(request) {
    // host-specific auth extraction here
    return {
      id: "user-1",
      email: "user@example.com",
      role: "admin",
      permissions: ["*:*"]
    };
  }
};

const dashboard = await createDashboard({
  authAdapter,
  config: "env:ADMIN_DASHBOARD_CONFIG"
});
```

---

## Completion Report Template

```markdown
## Admin Dashboard Integration — Complete

Method: [Mode A | Mode B | Mode C]
Business Profile: [generic | field-service | saas | commerce]
Auth Provider: [memory | nextauth | clerk | jwt | custom]

### Evidence
- Submodule status command/result
- Package resolution command/result
- Typecheck command/result
- Build command/result
- Health endpoint result
- Profiles endpoint result

### Files Changed
[paste `git status --porcelain`]

### Notes
- Any host-specific proxy/router/auth decisions
- Any follow-up hardening tasks
```

---

## Blocked Report Template

````markdown
## Admin Dashboard Integration — BLOCKED

Reason: [short reason]
Failed Step: [step number]

### Exact Error
```text
[paste exact stderr/stdout]
```

### What Was Tried
- [attempt 1]
- [attempt 2]

### Required Operator Action
- [clear, minimal next action]
````

---

## FAQ

Q: Do I need to build CRM/payments/inventory pages manually?
A: No. Those are already included in the pre-built module system and starter runtime.

Q: Can I switch modules by business type?
A: Yes. Set `ADMIN_BUSINESS_PROFILE`.

Q: Can I run completely plug-and-play with almost no host code edits?
A: Yes. Use Mode A (sidecar + reverse proxy).

Q: Can I still deeply customize?
A: Yes. Use Mode C and patch starter runtime/config in a controlled way while keeping package contracts intact.
