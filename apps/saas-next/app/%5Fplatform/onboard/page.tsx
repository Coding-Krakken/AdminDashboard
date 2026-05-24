"use client";

import { useMemo, useState } from "react";

type Stage = "tenant" | "domain" | "done";
type AccessStrategy = "domain" | "api-alias" | "both";

interface CreatedTenant {
  id: string;
  slug: string;
  name: string;
}

interface DomainVerificationRecord {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  notes?: string;
}

interface CreatedDomain {
  id: string;
  domain: string;
  verified: boolean;
}

interface PlatformAlias {
  tenantId: string;
  routePath: string;
  dashboardUrl: string;
}

export default function PlatformOnboardPage() {
  const [stage, setStage] = useState<Stage>("tenant");
  const [apiToken, setApiToken] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [accessStrategy, setAccessStrategy] = useState<AccessStrategy>("domain");
  const [tenant, setTenant] = useState<CreatedTenant | null>(null);
  const [createdDomain, setCreatedDomain] = useState<CreatedDomain | null>(null);
  const [platformAlias, setPlatformAlias] = useState<PlatformAlias | null>(null);
  const [verification, setVerification] = useState<DomainVerificationRecord[]>([]);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreateTenant = useMemo(() => {
    return apiToken.trim().length > 0 && tenantName.trim().length > 0 && tenantSlug.trim().length > 1;
  }, [apiToken, tenantName, tenantSlug]);

  const canCreateDomain = useMemo(() => {
    if (!tenant) {
      return false;
    }

    if (accessStrategy === "api-alias") {
      return true;
    }

    return domain.trim().length > 3;
  }, [tenant, domain, accessStrategy]);

  const needsDomain = accessStrategy === "domain" || accessStrategy === "both";

  const shouldShowAlias = accessStrategy === "api-alias" || accessStrategy === "both";

  function buildAliasForTenant(createdTenant: CreatedTenant): PlatformAlias {
    const routePath = `/api/platform/route/${createdTenant.id}`;
    const origin = typeof window !== "undefined" ? window.location.origin : "";

    return {
      tenantId: createdTenant.id,
      routePath,
      dashboardUrl: `${origin}${routePath}`
    };
  }

  function buildCopilotWiringPrompt(createdTenant: CreatedTenant, alias: PlatformAlias): string {
    const origin = typeof window !== "undefined" ? window.location.origin : "https://<your-vercel-url>";
    const aliasUrl = `${origin}${alias.routePath}`;

    return [
      "You are wiring the AdminDashboard SaaS app to a tenant API route alias. Execute this implementation fully, run validation, and prepare for deployment with no missing steps.",
      "",
      "Project Context:",
      "- Monorepo root: /home/obsidian/Projects/AdminDashboard",
      "- SaaS app: apps/saas-next",
      "- Current tenant:",
      `  - tenantId: ${createdTenant.id}`,
      `  - tenantSlug: ${createdTenant.slug}`,
      `  - tenantName: ${createdTenant.name}`,
      `  - apiAliasRoute: ${alias.routePath}`,
      `  - apiAliasUrl: ${aliasUrl}`,
      "",
      "Primary Goal:",
      "- Ensure the admin dashboard is accessible through the alias path and behaves like the tenant dashboard.",
      "- Keep existing custom-domain (subdomain + DNS verification) onboarding fully intact.",
      "- Do not break platform APIs or platform onboarding routes.",
      "",
      "Required Implementation:",
      "1) Middleware alias routing",
      "- File: apps/saas-next/middleware.ts",
      "- Add alias prefix matching for /api/platform/route/{tenantId}",
      "- Extract tenantId from the pathname",
      "- Set headers:",
      "  - x-tenant-mode: tenant",
      "  - x-tenant-id: {tenantId}",
      "- Rewrite request to tenant app route:",
      "  - /api/platform/route/{tenantId} -> /",
      "  - /api/platform/route/{tenantId}/<nested-path> -> /<nested-path>",
      "- Preserve query params.",
      "- Keep /api/platform/* and /_platform* platform behaviors unchanged.",
      "",
      "2) Runtime tenant resolution",
      "- File: apps/saas-next/src/platform/runtime.ts",
      "- In resolveTenantFromRequest(), prefer x-tenant-id when present.",
      "- Resolve tenant via resolveById(x-tenant-id).",
      "- Fall back to hostname-based resolveByDomain() when x-tenant-id is absent.",
      "- Keep platform-mode behavior returning null tenant context.",
      "",
      "3) Resolver hardening",
      "- File: packages/adapters/src/tenant-resolver.ts",
      "- Ensure resolveById returns only ACTIVE tenants for tenant-mode usage.",
      "",
      "4) Onboarding UX",
      "- File: apps/saas-next/app/%5Fplatform/onboard/page.tsx",
      "- Keep subdomain onboarding flow.",
      "- Offer strategy options in the same section:",
      "  - Custom Domain",
      "  - Platform API Alias",
      "  - Both",
      "- Show alias details when alias mode is selected.",
      "- Keep DNS verification UI for domain flow.",
      "",
      "5) Tests",
      "- Update tests in:",
      "  - apps/saas-next/src/__tests__/middleware.test.ts",
      "  - apps/saas-next/src/__tests__/runtime.test.ts",
      "  - apps/saas-next/app/api/platform/tenants/[id]/domains/__tests__/route.test.ts (if payload/schema changed)",
      "  - apps/saas-next/app/api/platform/openapi/__tests__/route.test.ts (if OpenAPI changed)",
      "- Add assertions for alias rewrite and x-tenant-id routing.",
      "",
      "6) Verification Commands (run from repo root)",
      "- npm run typecheck:saas",
      "- npm run test:saas",
      "- npm run test",
      "- npm run verify:saas-smoke -- --base-url=<deployment-url> --platform-secret=<secret>",
      "",
      "Deployment Validation:",
      "- Deploy apps/saas-next to Vercel.",
      "- Confirm:",
      "  - GET /api/platform/health returns 200",
      "  - GET /api/platform/openapi returns 200",
      `  - ${alias.routePath} renders tenant dashboard`,
      "  - custom domain onboarding still works",
      "",
      "Success Criteria:",
      "- Tenant dashboard is wired and reachable through the API alias route.",
      "- Existing subdomain/domain onboarding remains functional.",
      "- Tests and type checks pass.",
      "- Deployment is successful with no tenant-routing regressions."
    ].join("\n");
  }

  async function createTenant() {
    if (!canCreateTenant || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch("/api/platform/tenants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          name: tenantName.trim(),
          slug: tenantSlug.trim().toLowerCase(),
          authProvider: "platform"
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create tenant");
      }

      setTenant(payload.tenant);
      setPlatformAlias(buildAliasForTenant(payload.tenant));
      setCopyMessage("");
      setStage("domain");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create tenant");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function createDomain() {
    if (!canCreateDomain || !tenant || isSubmitting) return;
    setIsSubmitting(true);
    setError("");

    try {
      const alias = buildAliasForTenant(tenant);
      setPlatformAlias(alias);

      if (!needsDomain) {
        setCreatedDomain(null);
        setVerification([]);
        setVerificationMessage(`Platform API alias ready at ${alias.routePath}`);
        setStage("done");
        return;
      }

      const response = await fetch(`/api/platform/tenants/${tenant.id}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          domain: domain.trim().toLowerCase(),
          isPrimary: true,
          accessStrategy
        })
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to create domain");
      }

      setCreatedDomain(payload.domain ?? null);
      setVerification(payload.verification ?? []);
      setVerificationMessage(payload.verified ? "Domain already verified" : "Verification required");
      setStage("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create domain");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function verifyDomainNow() {
    if (!tenant || !createdDomain || isSubmitting || !needsDomain) {
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const response = await fetch(
        `/api/platform/tenants/${tenant.id}/domains/${createdDomain.id}/verify`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${apiToken}`
          }
        }
      );

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to verify domain");
      }

      setVerification(payload.verification ?? []);
      setCreatedDomain(payload.domain ?? createdDomain);
      setVerificationMessage(payload.message ?? "Verification checked");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to verify domain");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function copyForLlm() {
    if (!tenant || !platformAlias) {
      setCopyMessage("Create a tenant first to generate a copyable prompt.");
      return;
    }

    try {
      const prompt = buildCopilotWiringPrompt(tenant, platformAlias);
      await navigator.clipboard.writeText(prompt);
      setCopyMessage("Copied complete Copilot wiring instructions to clipboard.");
    } catch {
      setCopyMessage("Unable to copy. Clipboard access was blocked by the browser.");
    }
  }

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Tenant Onboarding</h1>
          <p className="text-muted-foreground mt-2">
            Provision a tenant and choose how to connect it: via a custom domain (DNS subdomain) or a URL route path — no DNS setup required.
          </p>
        </header>

        <div className="rounded-lg border border-border p-5 bg-card space-y-5">
          <div>
            <label className="block text-sm font-medium mb-2">Platform API Token</label>
            <input
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              type="password"
              value={apiToken}
              onChange={(e) => setApiToken(e.target.value)}
              placeholder="Bearer token for PLATFORM_ADMIN_SECRET"
            />
          </div>

          {stage === "tenant" && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium">1. Create Tenant</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium mb-2">Tenant Name</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tenantName}
                    onChange={(e) => setTenantName(e.target.value)}
                    placeholder="Acme Corp"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-2">Tenant Slug</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={tenantSlug}
                    onChange={(e) => setTenantSlug(e.target.value)}
                    placeholder="acme"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label className="block text-sm font-medium">Access Method</label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm text-left ${
                      accessStrategy === "domain"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                    onClick={() => setAccessStrategy("domain")}
                  >
                    <span className="font-medium block">Custom Domain</span>
                    <span className="text-xs text-muted-foreground">DNS subdomain mapping</span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm text-left ${
                      accessStrategy === "api-alias"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                    onClick={() => setAccessStrategy("api-alias")}
                  >
                    <span className="font-medium block">Route Path</span>
                    <span className="text-xs text-muted-foreground">Mount at a URL route</span>
                  </button>
                  <button
                    type="button"
                    className={`rounded-md border px-3 py-2 text-sm text-left ${
                      accessStrategy === "both"
                        ? "border-primary bg-primary/10"
                        : "border-border bg-background"
                    }`}
                    onClick={() => setAccessStrategy("both")}
                  >
                    <span className="font-medium block">Both</span>
                    <span className="text-xs text-muted-foreground">Domain + route path</span>
                  </button>
                </div>
              </div>

              <button
                onClick={createTenant}
                disabled={!canCreateTenant || isSubmitting}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? "Creating..." : "Create Tenant"}
              </button>
            </section>
          )}

          {stage === "domain" && tenant && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium">2. Attach Domain</h2>
              <p className="text-sm text-muted-foreground">
                Tenant <span className="font-medium text-foreground">{tenant.name}</span> created.
                Access method: <span className="font-medium text-foreground">
                  {accessStrategy === "domain" ? "Custom Domain" : accessStrategy === "api-alias" ? "Route Path" : "Both"}
                </span>
              </p>

              {needsDomain && (
                <div>
                  <label className="block text-sm font-medium mb-2">Custom Domain</label>
                  <input
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={domain}
                    onChange={(e) => setDomain(e.target.value)}
                    placeholder="admin.acme.com"
                  />
                </div>
              )}

              {shouldShowAlias && platformAlias && (
                <div className="rounded-md border border-border p-3 bg-background space-y-2">
                  <p className="text-sm font-medium">Route Path Access</p>
                  <p className="text-xs text-muted-foreground">{platformAlias.routePath}</p>
                  <button
                    type="button"
                    onClick={copyForLlm}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium"
                  >
                    Copy for LLM
                  </button>
                  {copyMessage && <p className="text-xs text-muted-foreground">{copyMessage}</p>}
                </div>
              )}

              <button
                onClick={createDomain}
                disabled={!canCreateDomain || isSubmitting}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : needsDomain ? "Attach Domain" : "Generate Alias"}
              </button>
            </section>
          )}

          {stage === "done" && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium">3. Verify DNS</h2>
              {needsDomain ? (
                <>
                  <p className="text-sm text-muted-foreground">
                    Add the following DNS records to complete verification.
                  </p>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={verifyDomainNow}
                      disabled={!createdDomain || isSubmitting}
                      className="rounded-md border border-border px-4 py-2 text-sm font-medium disabled:opacity-50"
                    >
                      {isSubmitting ? "Checking..." : "Verify Now"}
                    </button>
                    {verificationMessage && (
                      <span className="text-sm text-muted-foreground">{verificationMessage}</span>
                    )}
                  </div>
                </>
              ) : (
                <p className="text-sm text-muted-foreground">
                  DNS verification is skipped for alias-only mode.
                </p>
              )}

              {platformAlias && shouldShowAlias && (
                <div className="rounded-md border border-border p-3 bg-background space-y-2">
                  <p className="text-sm font-medium">Route Path Ready</p>
                  <p className="text-xs text-muted-foreground">{platformAlias.dashboardUrl}</p>
                  <button
                    type="button"
                    onClick={copyForLlm}
                    className="rounded-md border border-border px-3 py-2 text-xs font-medium"
                  >
                    Copy for LLM
                  </button>
                </div>
              )}

              <div className="space-y-3">
                {verification.map((record, index) => (
                  <div key={`${record.type}-${record.name}-${index}`} className="rounded-md border border-border p-3 bg-background">
                    <div className="text-sm font-medium">{record.type}</div>
                    <div className="text-xs text-muted-foreground mt-1">Name: {record.name}</div>
                    <div className="text-xs text-muted-foreground">Value: {record.value}</div>
                    {record.notes && (
                      <div className="text-xs text-muted-foreground mt-1">{record.notes}</div>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}

          {error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      </div>
    </main>
  );
}
