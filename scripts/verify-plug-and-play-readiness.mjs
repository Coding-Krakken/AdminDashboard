#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const VALID_PROFILES = new Set(["generic", "field-service", "saas", "commerce"]);
const VALID_AUTH_PROVIDERS = new Set(["memory", "nextauth", "clerk", "jwt", "anonymous"]);

function normalizePath(value, fallback) {
  const trimmed = (value ?? "").trim();
  if (!trimmed) {
    return fallback;
  }

  const withSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const normalized = withSlash.replace(/\/+$/, "");
  return normalized || fallback;
}

function parseArgs(argv) {
  const parsed = {
    baseUrl: null,
    timeoutMs: 5000,
    adminPath: "/admin",
    moduleRoutes: ["crm", "reporting", "settings"],
    strictHttp: false,
    help: false
  };

  for (const arg of argv) {
    if (arg.startsWith("--base-url=")) {
      parsed.baseUrl = arg.slice("--base-url=".length).replace(/\/$/, "");
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      const raw = Number(arg.slice("--timeout-ms=".length));
      if (Number.isFinite(raw) && raw > 0) {
        parsed.timeoutMs = raw;
      }
      continue;
    }

    if (arg.startsWith("--admin-path=")) {
      parsed.adminPath = normalizePath(arg.slice("--admin-path=".length), "/admin");
      continue;
    }

    if (arg.startsWith("--module-routes=")) {
      parsed.moduleRoutes = arg
        .slice("--module-routes=".length)
        .split(",")
        .map((entry) => normalizePath(entry, ""))
        .filter(Boolean)
        .map((entry) => entry.replace(/^\//, ""));
      continue;
    }

    if (arg === "--strict-http") {
      parsed.strictHttp = true;
      continue;
    }

    if (arg === "-h" || arg === "--help") {
      parsed.help = true;
    }
  }

  return parsed;
}

function printUsage() {
  console.log(`Usage: node scripts/verify-plug-and-play-readiness.mjs [options]

Options:
  --base-url=<url>        Check /api/admin/* and admin UI routes on this base URL
  --admin-path=<path>     Mounted admin UI path (default: /admin)
  --module-routes=<list>  Comma-separated module routes to check (default: crm,reporting,settings)
  --timeout-ms=<ms>       HTTP timeout in milliseconds (default: 5000)
  --strict-http           Treat HTTP endpoint failures as hard failures
  -h, --help              Show this help

Examples:
  node scripts/verify-plug-and-play-readiness.mjs
  node scripts/verify-plug-and-play-readiness.mjs --base-url=http://localhost:3000
  node scripts/verify-plug-and-play-readiness.mjs --base-url=http://localhost:3000 --admin-path=/admin --strict-http
`);
}

function getPackageResolutions() {
  const packages = [
    "@universal-admin/core",
    "@universal-admin/adapters",
    "@universal-admin/ui",
    "@universal-admin/theming"
  ];

  return packages.map((name) => {
    try {
      const location = require.resolve(name);
      return { name, ok: true, detail: location };
    } catch (error) {
      const detail = error instanceof Error ? error.message : "unable to resolve package";
      return { name, ok: false, detail };
    }
  });
}

function checkSubmodule() {
  const repoRoot = process.cwd();
  const gitmodulesPath = resolve(repoRoot, ".gitmodules");
  const submodulePath = resolve(repoRoot, "admin-dashboard");

  const hasSubmoduleDir = existsSync(submodulePath);
  if (!existsSync(gitmodulesPath)) {
    return {
      ok: false,
      detail: hasSubmoduleDir
        ? "admin-dashboard directory exists, but .gitmodules is missing"
        : "admin-dashboard submodule is missing"
    };
  }

  const gitmodules = readFileSync(gitmodulesPath, "utf8");
  const hasEntry = gitmodules.includes('path = admin-dashboard');

  return {
    ok: hasSubmoduleDir && hasEntry,
    detail:
      hasSubmoduleDir && hasEntry
        ? "admin-dashboard submodule is present"
        : "admin-dashboard entry missing in .gitmodules or directory missing"
  };
}

function checkEnv() {
  const profile = (process.env.ADMIN_BUSINESS_PROFILE ?? "").trim();
  const provider = (process.env.ADMIN_AUTH_PROVIDER ?? "").trim();
  const publicBasePath = normalizePath(process.env.ADMIN_PUBLIC_BASE_PATH, "/admin");

  const profileOk = Boolean(profile) && VALID_PROFILES.has(profile);
  const providerOk = Boolean(provider) && VALID_AUTH_PROVIDERS.has(provider);

  return [
    {
      name: "ADMIN_BUSINESS_PROFILE",
      ok: profileOk,
      detail: profile
        ? profileOk
          ? `set to ${profile}`
          : `invalid value ${profile}; expected one of: ${Array.from(VALID_PROFILES).join(", ")}`
        : "not set"
    },
    {
      name: "ADMIN_AUTH_PROVIDER",
      ok: providerOk,
      detail: provider
        ? providerOk
          ? `set to ${provider}`
          : `invalid value ${provider}; expected one of: ${Array.from(VALID_AUTH_PROVIDERS).join(", ")}`
        : "not set"
    },
    {
      name: "ADMIN_PUBLIC_BASE_PATH",
      ok: publicBasePath.length > 1,
      detail:
        process.env.ADMIN_PUBLIC_BASE_PATH && process.env.ADMIN_PUBLIC_BASE_PATH.trim().length > 0
          ? `set to ${publicBasePath}`
          : "not set (recommended: /admin for sidecar mode)"
    }
  ];
}

async function checkEndpoint(url, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    return {
      ok: response.ok,
      detail: `HTTP ${response.status}`
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "request failed";
    return { ok: false, detail };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function checkHtmlEndpoint(url, timeoutMs, expectedSnippet) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, { signal: controller.signal });
    const body = await response.text();
    const hasSnippet = expectedSnippet ? body.includes(expectedSnippet) : true;
    return {
      ok: response.ok && hasSnippet,
      detail: hasSnippet
        ? `HTTP ${response.status}`
        : `HTTP ${response.status}; expected snippet not found: ${expectedSnippet}`
    };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "request failed";
    return { ok: false, detail };
  } finally {
    clearTimeout(timeoutId);
  }
}

function printSection(title) {
  console.log(`\n=== ${title} ===`);
}

function printChecks(checks) {
  for (const check of checks) {
    const status = check.ok ? "PASS" : "FAIL";
    console.log(`[${status}] ${check.name}: ${check.detail}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help) {
    printUsage();
    return;
  }

  printSection("Submodule");
  const submodule = checkSubmodule();
  printChecks([{ name: "admin-dashboard", ok: submodule.ok, detail: submodule.detail }]);

  printSection("Package Resolution");
  const packageChecks = getPackageResolutions();
  printChecks(packageChecks);

  printSection("Environment");
  const envChecks = checkEnv();
  printChecks(envChecks);

  let httpChecks = [];
  if (args.baseUrl) {
    printSection("HTTP Endpoints");
    const normalizedAdminPath = normalizePath(args.adminPath, "/admin");
    const health = await checkEndpoint(`${args.baseUrl}/api/admin/health`, args.timeoutMs);
    const profiles = await checkEndpoint(`${args.baseUrl}/api/admin/profiles`, args.timeoutMs);
    const adminUi = await checkHtmlEndpoint(
      `${args.baseUrl}${normalizedAdminPath}`,
      args.timeoutMs,
      "Universal"
    );

    const moduleChecks = [];
    for (const route of args.moduleRoutes) {
      const modulePath = `${normalizedAdminPath}/${route}`.replace(/\/+/g, "/");
      const result = await checkEndpoint(`${args.baseUrl}${modulePath}`, args.timeoutMs);
      moduleChecks.push({
        name: `${args.baseUrl}${modulePath}`,
        ok: result.ok,
        detail: result.detail
      });
    }

    httpChecks = [
      {
        name: `${args.baseUrl}/api/admin/health`,
        ok: health.ok,
        detail: health.detail
      },
      {
        name: `${args.baseUrl}/api/admin/profiles`,
        ok: profiles.ok,
        detail: profiles.detail
      },
      {
        name: `${args.baseUrl}${normalizedAdminPath}`,
        ok: adminUi.ok,
        detail: adminUi.detail
      }
    ].concat(moduleChecks);

    printChecks(httpChecks);
  }

  const hardFailures = [
    !submodule.ok,
    ...packageChecks.map((c) => !c.ok),
    ...envChecks.map((c) => !c.ok),
    ...(args.strictHttp ? httpChecks.map((c) => !c.ok) : [])
  ].some(Boolean);

  printSection("Summary");
  console.log(`baseUrl: ${args.baseUrl ?? "(not provided)"}`);
  console.log(`adminPath: ${args.adminPath}`);
  console.log(`moduleRoutes: ${args.moduleRoutes.join(",")}`);
  console.log(`strictHttp: ${args.strictHttp ? "enabled" : "disabled"}`);

  if (hardFailures) {
    console.error("\nPlug-and-play readiness: FAILED");
    process.exit(1);
  }

  console.log("\nPlug-and-play readiness: PASSED");
}

await main();
