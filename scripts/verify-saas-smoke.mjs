#!/usr/bin/env node

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.SAAS_BASE_URL ?? "http://localhost:3000",
    platformSecret: process.env.PLATFORM_ADMIN_SECRET ?? "",
    timeoutMs: 15_000,
    cleanup: true,
    tenantName: "Smoke Test Tenant",
    tenantSlugPrefix: "smoke",
    domain: "",
    requireProvisioning: true,
    help: false
  };

  for (const arg of argv) {
    if (arg === "-h" || arg === "--help") {
      options.help = true;
      continue;
    }

    if (arg === "--no-cleanup") {
      options.cleanup = false;
      continue;
    }

    if (arg === "--no-provisioning") {
      options.requireProvisioning = false;
      continue;
    }

    if (arg.startsWith("--base-url=")) {
      options.baseUrl = arg.slice("--base-url=".length);
      continue;
    }

    if (arg.startsWith("--platform-secret=")) {
      options.platformSecret = arg.slice("--platform-secret=".length);
      continue;
    }

    if (arg.startsWith("--timeout-ms=")) {
      const parsed = Number(arg.slice("--timeout-ms=".length));
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = Math.floor(parsed);
      }
      continue;
    }

    if (arg.startsWith("--tenant-name=")) {
      options.tenantName = arg.slice("--tenant-name=".length);
      continue;
    }

    if (arg.startsWith("--tenant-slug-prefix=")) {
      options.tenantSlugPrefix = arg.slice("--tenant-slug-prefix=".length);
      continue;
    }

    if (arg.startsWith("--domain=")) {
      options.domain = arg.slice("--domain=".length);
      continue;
    }
  }

  return options;
}

function usage() {
  return `Usage: node scripts/verify-saas-smoke.mjs [options]

Options:
  --base-url=<url>             SaaS deployment base URL (default: SAAS_BASE_URL or http://localhost:3000)
  --platform-secret=<secret>   Platform bearer secret (default: PLATFORM_ADMIN_SECRET env)
  --tenant-name=<name>         Name used for smoke tenant creation
  --tenant-slug-prefix=<slug>  Prefix used to generate a unique smoke tenant slug
  --domain=<domain>            Domain to use for creation test (default: generated <slug>.example.com)
  --timeout-ms=<ms>            HTTP timeout in milliseconds (default: 15000)
  --no-cleanup                 Keep created tenant/domain instead of deleting tenant after checks
  --no-provisioning            Skip mutating provisioning checks (health/openapi only)
  -h, --help                   Show this help

Examples:
  node scripts/verify-saas-smoke.mjs --base-url=http://localhost:3000
  node scripts/verify-saas-smoke.mjs --base-url=https://admin.example.com --platform-secret=...
`;
}

function normalizeBaseUrl(input) {
  const trimmed = input.trim();
  if (!trimmed) {
    throw new Error("base-url cannot be empty");
  }
  return trimmed.replace(/\/+$/, "");
}

function buildAuthHeaders(platformSecret) {
  if (!platformSecret) {
    return {};
  }

  return {
    Authorization: `Bearer ${platformSecret}`
  };
}

async function requestJson(url, init, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...init,
      signal: controller.signal,
      headers: {
        "content-type": "application/json",
        ...(init?.headers ?? {})
      }
    });

    let body;
    const text = await response.text();
    if (text.length > 0) {
      try {
        body = JSON.parse(text);
      } catch {
        body = text;
      }
    }

    return {
      ok: response.ok,
      status: response.status,
      body
    };
  } finally {
    clearTimeout(timeout);
  }
}

function assertCondition(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const baseUrl = normalizeBaseUrl(options.baseUrl);
  const authHeaders = buildAuthHeaders(options.platformSecret);
  const slug = `${options.tenantSlugPrefix}-${Date.now().toString(36)}`;
  const domain = options.domain || `${slug}.example.com`;

  const summary = [];
  let createdTenantId = "";
  let createdDomainId = "";

  console.log(`Starting SaaS smoke check against ${baseUrl}`);

  const health = await requestJson(`${baseUrl}/api/platform/health`, { method: "GET" }, options.timeoutMs);
  assertCondition(health.status === 200, `health endpoint returned ${health.status}`);
  assertCondition(health.body?.status === "healthy", "health payload missing expected status=healthy");
  summary.push("Health check passed");

  const openapi = await requestJson(`${baseUrl}/api/platform/openapi`, { method: "GET" }, options.timeoutMs);
  assertCondition(openapi.status === 200, `openapi endpoint returned ${openapi.status}`);
  assertCondition(openapi.body?.openapi === "3.1.0", "openapi payload missing expected version");
  summary.push("OpenAPI check passed");

  if (options.requireProvisioning) {
    assertCondition(Boolean(options.platformSecret), "platform secret is required for provisioning checks");

    const createTenant = await requestJson(
      `${baseUrl}/api/platform/tenants`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({
          slug,
          name: options.tenantName
        })
      },
      options.timeoutMs
    );

    assertCondition(createTenant.status === 201, `tenant create returned ${createTenant.status}`);
    createdTenantId = createTenant.body?.tenant?.id ?? "";
    assertCondition(Boolean(createdTenantId), "tenant create response missing tenant.id");
    summary.push(`Tenant create passed (${createdTenantId})`);

    const createDomain = await requestJson(
      `${baseUrl}/api/platform/tenants/${createdTenantId}/domains`,
      {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ domain })
      },
      options.timeoutMs
    );

    assertCondition(createDomain.status === 201, `domain create returned ${createDomain.status}`);
    createdDomainId = createDomain.body?.domain?.id ?? "";
    assertCondition(Boolean(createdDomainId), "domain create response missing domain.id");
    summary.push(`Domain create passed (${domain})`);

    const verifyDomain = await requestJson(
      `${baseUrl}/api/platform/tenants/${createdTenantId}/domains/${createdDomainId}/verify`,
      {
        method: "POST",
        headers: authHeaders
      },
      options.timeoutMs
    );

    assertCondition(verifyDomain.status === 200, `domain verify returned ${verifyDomain.status}`);
    assertCondition(typeof verifyDomain.body?.verified === "boolean", "domain verify response missing verified boolean");
    summary.push(`Domain verify passed (verified=${String(verifyDomain.body?.verified)})`);
  }

  console.log("Smoke check summary:");
  for (const line of summary) {
    console.log(`- ${line}`);
  }

  if (options.cleanup && createdTenantId) {
    const cleanup = await requestJson(
      `${baseUrl}/api/platform/tenants/${createdTenantId}`,
      {
        method: "DELETE",
        headers: authHeaders
      },
      options.timeoutMs
    );

    assertCondition(cleanup.status === 200, `cleanup tenant delete returned ${cleanup.status}`);
    console.log(`Cleanup completed for tenant ${createdTenantId}`);
  }

  console.log("SaaS smoke check completed successfully.");
}

run().catch((error) => {
  console.error(`SaaS smoke check failed: ${error.message}`);
  process.exit(1);
});
