#!/usr/bin/env node

import { mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";

const VALID_PROFILES = new Set(["generic", "field-service", "saas", "commerce"]);
const VALID_AUTH_PROVIDERS = new Set(["memory", "nextauth", "clerk", "jwt", "anonymous"]);
const VALID_PROXIES = new Set(["nginx", "caddy", "both", "none"]);
const PROFILE_OPTIONS = ["auto", ...Array.from(VALID_PROFILES)];

const PROFILE_SIGNALS = {
  commerce: [
    "shopify",
    "woocommerce",
    "order",
    "orders",
    "sku",
    "catalog",
    "cart",
    "checkout",
    "fulfillment",
    "merchant"
  ],
  saas: [
    "saas",
    "subscription",
    "plan",
    "license",
    "seat",
    "tenant",
    "usage",
    "trial",
    "churn",
    "billing portal"
  ],
  "field-service": [
    "field service",
    "technician",
    "dispatch",
    "work order",
    "work-order",
    "appointment",
    "route",
    "onsite",
    "maintenance"
  ]
};

function parseArgs(argv) {
  const options = {
    targetDir: ".admin-dashboard-kit",
    profile: "auto",
    authProvider: "memory",
    hostPort: 3000,
    sidecarPort: 4100,
    publicBasePath: "/admin",
    profileHints: "",
    proxy: "both",
    interactive: false,
    force: false,
    dryRun: false,
    help: false
  };

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--force") {
      options.force = true;
      continue;
    }

    if (arg === "--dry-run") {
      options.dryRun = true;
      continue;
    }

    if (arg === "--interactive") {
      options.interactive = true;
      continue;
    }

    if (arg.startsWith("--target-dir=")) {
      options.targetDir = arg.slice("--target-dir=".length);
      continue;
    }

    if (arg.startsWith("--profile=")) {
      options.profile = arg.slice("--profile=".length);
      continue;
    }

    if (arg.startsWith("--profile-hints=")) {
      options.profileHints = arg.slice("--profile-hints=".length);
      continue;
    }

    if (arg.startsWith("--auth-provider=")) {
      options.authProvider = arg.slice("--auth-provider=".length);
      continue;
    }

    if (arg.startsWith("--host-port=")) {
      const hostPort = Number(arg.slice("--host-port=".length));
      if (Number.isFinite(hostPort) && hostPort > 0) {
        options.hostPort = Math.floor(hostPort);
      }
      continue;
    }

    if (arg.startsWith("--sidecar-port=")) {
      const sidecarPort = Number(arg.slice("--sidecar-port=".length));
      if (Number.isFinite(sidecarPort) && sidecarPort > 0) {
        options.sidecarPort = Math.floor(sidecarPort);
      }
      continue;
    }

    if (arg.startsWith("--proxy=")) {
      options.proxy = arg.slice("--proxy=".length);
      continue;
    }

    if (arg.startsWith("--public-base-path=")) {
      options.publicBasePath = arg.slice("--public-base-path=".length);
      continue;
    }
  }

  return options;
}

function usage() {
  return `Usage: node scripts/bootstrap-plug-and-play.mjs [options]

Options:
  --target-dir=<path>       Output directory for generated assets (default: .admin-dashboard-kit)
  --profile=<value>         Business profile: auto | generic | field-service | saas | commerce
  --profile-hints=<text>    Optional free-form host business hints to improve profile recommendation
  --auth-provider=<value>   Auth provider: memory | nextauth | clerk | jwt | anonymous
  --host-port=<number>      Host app port used in reverse proxy docs/snippets (default: 3000)
  --sidecar-port=<number>   Sidecar public port (default: 4100)
  --public-base-path=<path> Public mount path for sidecar UI (default: /admin)
  --proxy=<value>           Proxy config to generate: nginx | caddy | both | none (default: both)
  --interactive             Prompt for values interactively
  --force                   Overwrite existing files
  --dry-run                 Print intended outputs without writing files
  -h, --help                Show this help

Examples:
  node scripts/bootstrap-plug-and-play.mjs
  node scripts/bootstrap-plug-and-play.mjs --interactive
  node scripts/bootstrap-plug-and-play.mjs --profile=commerce --auth-provider=nextauth --proxy=nginx
  node scripts/bootstrap-plug-and-play.mjs --profile=auto --profile-hints='shopify checkout subscriptions'
  node scripts/bootstrap-plug-and-play.mjs --target-dir=./ops/admin-kit --sidecar-port=4200 --force
`;
}

function readTextIfPresent(filePath) {
  if (!existsSync(filePath)) {
    return "";
  }

  try {
    return readFileSync(filePath, "utf8");
  } catch {
    return "";
  }
}

function scoreProfileSignals(content) {
  const normalized = content.toLowerCase();
  const scores = {
    commerce: 0,
    saas: 0,
    "field-service": 0
  };

  for (const [profile, signals] of Object.entries(PROFILE_SIGNALS)) {
    for (const signal of signals) {
      if (normalized.includes(signal)) {
        scores[profile] += 1;
      }
    }
  }

  return scores;
}

function detectRecommendedProfile(options) {
  const packageJson = readTextIfPresent(resolve(process.cwd(), "package.json"));
  const readme = readTextIfPresent(resolve(process.cwd(), "README.md"));
  const hints = typeof options.profileHints === "string" ? options.profileHints : "";

  const scores = scoreProfileSignals(`${packageJson}\n${readme}\n${hints}`);
  const ranked = Object.entries(scores)
    .sort((a, b) => b[1] - a[1])
    .filter((entry) => entry[1] > 0);

  if (ranked.length === 0) {
    return {
      profile: "generic",
      confidence: "low",
      reasons: ["No business-domain keywords were detected in package.json, README.md, or hints."]
    };
  }

  const [winner, winnerScore] = ranked[0];
  const runnerUpScore = ranked[1]?.[1] ?? 0;
  const confidence =
    winnerScore >= 4 && winnerScore - runnerUpScore >= 2
      ? "high"
      : winnerScore >= 2
        ? "medium"
        : "low";

  const reasons = PROFILE_SIGNALS[winner]
    .filter((signal) => `${packageJson}\n${readme}\n${hints}`.toLowerCase().includes(signal))
    .slice(0, 5)
    .map((signal) => `Matched signal: ${signal}`);

  return {
    profile: winner,
    confidence,
    reasons
  };
}

function normalizePublicBasePath(rawValue) {
  const trimmed = (rawValue ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "/admin";
  }

  const withLeadingSlash = trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
  const withoutTrailing = withLeadingSlash.replace(/\/+$/, "");
  return withoutTrailing || "/admin";
}

async function promptInteractive(options) {
  const rl = createInterface({ input, output });

  const askText = async (label, current) => {
    const answer = await rl.question(`${label} [${current}]: `);
    const trimmed = answer.trim();
    return trimmed || current;
  };

  const askChoice = async (label, current, allowed) => {
    while (true) {
      const answer = await rl.question(
        `${label} (${allowed.join("|")}) [${current}]: `
      );
      const trimmed = answer.trim();
      const candidate = trimmed || current;
      if (allowed.includes(candidate)) {
        return candidate;
      }
      console.log(`Invalid value: ${candidate}`);
    }
  };

  const askNumber = async (label, current) => {
    while (true) {
      const answer = await rl.question(`${label} [${current}]: `);
      const trimmed = answer.trim();
      const candidate = trimmed ? Number(trimmed) : Number(current);
      if (Number.isFinite(candidate) && candidate >= 1 && candidate <= 65535) {
        return Math.floor(candidate);
      }
      console.log("Invalid port. Enter a value between 1 and 65535.");
    }
  };

  try {
    console.log("Interactive plug-and-play bootstrap");
    options.targetDir = await askText("Target output directory", options.targetDir);
    const recommendation = detectRecommendedProfile(options);
    console.log(
      `Recommended profile: ${recommendation.profile} (${recommendation.confidence} confidence)`
    );
    options.profile = await askChoice(
      "Business profile",
      options.profile,
      PROFILE_OPTIONS
    );
    options.authProvider = await askChoice(
      "Auth provider",
      options.authProvider,
      Array.from(VALID_AUTH_PROVIDERS)
    );
    options.hostPort = await askNumber("Host app port", options.hostPort);
    options.sidecarPort = await askNumber("Sidecar port", options.sidecarPort);
    options.publicBasePath = await askText(
      "Public mount path",
      options.publicBasePath
    );
    options.proxy = await askChoice("Proxy mode", options.proxy, Array.from(VALID_PROXIES));

    const overwrite = await askChoice(
      "Overwrite existing files",
      options.force ? "yes" : "no",
      ["yes", "no"]
    );
    options.force = overwrite === "yes";

    const dry = await askChoice("Dry run only", options.dryRun ? "yes" : "no", [
      "yes",
      "no"
    ]);
    options.dryRun = dry === "yes";
  } finally {
    rl.close();
  }
}

function assertOptions(options) {
  if (!PROFILE_OPTIONS.includes(options.profile)) {
    throw new Error(`Invalid --profile value: ${options.profile}`);
  }

  if (!VALID_AUTH_PROVIDERS.has(options.authProvider)) {
    throw new Error(`Invalid --auth-provider value: ${options.authProvider}`);
  }

  if (!VALID_PROXIES.has(options.proxy)) {
    throw new Error(`Invalid --proxy value: ${options.proxy}`);
  }

  if (options.hostPort < 1 || options.hostPort > 65535) {
    throw new Error(`Invalid --host-port value: ${options.hostPort}`);
  }

  if (options.sidecarPort < 1 || options.sidecarPort > 65535) {
    throw new Error(`Invalid --sidecar-port value: ${options.sidecarPort}`);
  }

  if (!options.publicBasePath.startsWith("/")) {
    throw new Error(`Invalid --public-base-path value: ${options.publicBasePath}`);
  }
}

function toDockerCompose(options) {
  return `version: "3.9"

services:
  universal-admin-starter:
    image: node:22-alpine
    container_name: universal-admin-starter
    working_dir: /app
    command: sh -c "npm install && npm run dev -w @universal-admin/starter-next"
    ports:
      - "${options.sidecarPort}:3000"
    env_file:
      - ./.env.admin-dashboard
    volumes:
      - ./admin-dashboard:/app
`;
}

function toEnvFile(options) {
  return `# Generated by scripts/bootstrap-plug-and-play.mjs
# Business profile: generic | field-service | saas | commerce
ADMIN_BUSINESS_PROFILE=${options.profile}

# Sidecar mount path contract (must match host proxy mount)
ADMIN_PUBLIC_BASE_PATH=${options.publicBasePath}

# Auth provider: memory | nextauth | clerk | jwt | anonymous
ADMIN_AUTH_PROVIDER=${options.authProvider}

# Dev identity defaults (adjust for production)
ADMIN_AUTH_USER_ID=dev-admin
ADMIN_AUTH_ROLE=admin
ADMIN_AUTH_EMAIL=admin@localhost
ADMIN_AUTH_TENANT_ID=tenant-demo
ADMIN_AUTH_PERMISSIONS=dashboard:read,settings:read,settings:write,audit:read

# Optional theme override file produced by bootstrap kit
ADMIN_HOST_THEME_FILE=${options.targetDir}/theme.tokens.json
`;
}

function toThemeTokenScaffold(options) {
  const profileAccentMap = {
    generic: "#1d4ed8",
    "field-service": "#f59e0b",
    saas: "#14b8a6",
    commerce: "#f97316"
  };

  const accent = profileAccentMap[options.profile] ?? profileAccentMap.generic;

  return JSON.stringify(
    {
      "dashboard-bg": "#0b1220",
      "dashboard-panel": "#0f172a",
      "dashboard-muted-panel": "#111f35",
      "dashboard-text": "#e5ecf6",
      "dashboard-text-muted": "#9fb0c6",
      "dashboard-accent": accent,
      "dashboard-border": "#20324d"
    },
    null,
    2
  );
}

function toProfileRecommendationFile(profileRecommendation, sourceProfile) {
  return JSON.stringify(
    {
      selectedProfile: sourceProfile,
      recommendedProfile: profileRecommendation.profile,
      confidence: profileRecommendation.confidence,
      reasons: profileRecommendation.reasons,
      generatedAt: new Date().toISOString()
    },
    null,
    2
  );
}

function toNginxConfig(options) {
  return `# Generated by scripts/bootstrap-plug-and-play.mjs
# Host app port: ${options.hostPort}
# Sidecar port: ${options.sidecarPort}

upstream host_app {
  server host-app:${options.hostPort};
}

upstream admin_sidecar {
  server admin-sidecar:${options.sidecarPort};
}

server {
  listen 80;
  server_name _;

  location /admin {
    proxy_pass http://admin_sidecar;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location /admin/ {
    proxy_pass http://admin_sidecar/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location /api/admin/ {
    proxy_pass http://admin_sidecar/api/admin/;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }

  location / {
    proxy_pass http://host_app;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Forwarded-Host $host;
  }
}
`;
}

function toCaddyConfig(options) {
  return `# Generated by scripts/bootstrap-plug-and-play.mjs
# Host app port: ${options.hostPort}
# Sidecar port: ${options.sidecarPort}

:80 {
  @admin_ui path /admin /admin/*
  reverse_proxy @admin_ui admin-sidecar:${options.sidecarPort}

  @admin_api path /api/admin/*
  reverse_proxy @admin_api admin-sidecar:${options.sidecarPort}

  reverse_proxy host-app:${options.hostPort}
}
`;
}

function toReadme(options, outputRoot) {
  return `# Admin Dashboard Plug-and-Play Kit

Generated assets are in: ${outputRoot}

## Files

- .env.admin-dashboard
- docker-compose.admin-dashboard.sidecar.yml
- theme.tokens.json
- profile.recommendation.json
- reverse-proxy/nginx.admin-dashboard.conf (if selected)
- reverse-proxy/caddy.admin-dashboard.Caddyfile (if selected)

## Selected Configuration

- profile: ${options.profile}
- auth provider: ${options.authProvider}
- host port: ${options.hostPort}
- sidecar port: ${options.sidecarPort}
- public base path: ${options.publicBasePath}
- proxy mode: ${options.proxy}

## Next Steps

1. Ensure AdminDashboard is present as a submodule at ./admin-dashboard
2. Start sidecar:
   docker compose -f ${outputRoot}/docker-compose.admin-dashboard.sidecar.yml up
3. Wire reverse proxy config from ${outputRoot}/reverse-proxy
4. Map theme tokens in ${outputRoot}/theme.tokens.json to your host brand.
5. Validate:
  node admin-dashboard/scripts/verify-plug-and-play-readiness.mjs --base-url=http://localhost:${options.hostPort} --admin-path=${options.publicBasePath} --strict-http
`;
}

function writeFileSafe(filePath, content, options) {
  if (existsSync(filePath) && !options.force) {
    throw new Error(`File already exists: ${filePath}. Re-run with --force to overwrite.`);
  }

  if (!options.dryRun) {
    mkdirSync(dirname(filePath), { recursive: true });
    writeFileSync(filePath, content, "utf8");
  }
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    console.log(usage());
    return;
  }

  if (options.interactive) {
    if (!input.isTTY) {
      throw new Error(
        "Interactive mode requires a TTY. Re-run in a terminal or use non-interactive flags."
      );
    }
    await promptInteractive(options);
  }

  assertOptions(options);
  options.publicBasePath = normalizePublicBasePath(options.publicBasePath);
  const profileRecommendation = detectRecommendedProfile(options);

  if (options.profile === "auto") {
    options.profile = profileRecommendation.profile;
  }

  const outputRoot = resolve(process.cwd(), options.targetDir);
  const planned = [
    {
      path: resolve(outputRoot, ".env.admin-dashboard"),
      content: toEnvFile(options)
    },
    {
      path: resolve(outputRoot, "docker-compose.admin-dashboard.sidecar.yml"),
      content: toDockerCompose(options)
    },
    {
      path: resolve(outputRoot, "theme.tokens.json"),
      content: toThemeTokenScaffold(options)
    },
    {
      path: resolve(outputRoot, "profile.recommendation.json"),
      content: toProfileRecommendationFile(profileRecommendation, options.profile)
    },
    {
      path: resolve(outputRoot, "README.generated.md"),
      content: toReadme(options, options.targetDir)
    }
  ];

  if (options.proxy === "nginx" || options.proxy === "both") {
    planned.push({
      path: resolve(outputRoot, "reverse-proxy/nginx.admin-dashboard.conf"),
      content: toNginxConfig(options)
    });
  }

  if (options.proxy === "caddy" || options.proxy === "both") {
    planned.push({
      path: resolve(outputRoot, "reverse-proxy/caddy.admin-dashboard.Caddyfile"),
      content: toCaddyConfig(options)
    });
  }

  if (options.dryRun) {
    console.log("Dry run: planned files");
    for (const entry of planned) {
      console.log(`- ${entry.path}`);
    }
    return;
  }

  mkdirSync(outputRoot, { recursive: true });
  for (const entry of planned) {
    writeFileSafe(entry.path, entry.content, options);
  }

  console.log("Plug-and-play kit generated successfully.");
  console.log(
    `Profile recommendation: ${profileRecommendation.profile} (${profileRecommendation.confidence} confidence)`
  );
  for (const entry of planned) {
    console.log(`- ${entry.path}`);
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : "Unknown error";
  console.error(`Bootstrap failed: ${message}`);
  process.exit(1);
});
