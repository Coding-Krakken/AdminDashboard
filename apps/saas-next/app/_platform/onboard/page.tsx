"use client";

import { useMemo, useState } from "react";

type Stage = "tenant" | "domain" | "done";

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

export default function PlatformOnboardPage() {
  const [stage, setStage] = useState<Stage>("tenant");
  const [apiToken, setApiToken] = useState("");
  const [tenantName, setTenantName] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [domain, setDomain] = useState("");
  const [tenant, setTenant] = useState<CreatedTenant | null>(null);
  const [createdDomain, setCreatedDomain] = useState<CreatedDomain | null>(null);
  const [verification, setVerification] = useState<DomainVerificationRecord[]>([]);
  const [verificationMessage, setVerificationMessage] = useState("");
  const [error, setError] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const canCreateTenant = useMemo(() => {
    return apiToken.trim().length > 0 && tenantName.trim().length > 0 && tenantSlug.trim().length > 1;
  }, [apiToken, tenantName, tenantSlug]);

  const canCreateDomain = useMemo(() => {
    return Boolean(tenant) && domain.trim().length > 3;
  }, [tenant, domain]);

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
      const response = await fetch(`/api/platform/tenants/${tenant.id}/domains`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiToken}`
        },
        body: JSON.stringify({
          domain: domain.trim().toLowerCase(),
          isPrimary: true
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
    if (!tenant || !createdDomain || isSubmitting) {
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

  return (
    <main className="min-h-screen bg-background text-foreground px-6 py-10">
      <div className="mx-auto max-w-3xl space-y-6">
        <header>
          <h1 className="text-3xl font-semibold tracking-tight">Tenant Onboarding</h1>
          <p className="text-muted-foreground mt-2">
            Provision a tenant, attach a custom domain, then follow DNS verification instructions.
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
              </p>
              <div>
                <label className="block text-sm font-medium mb-2">Custom Domain</label>
                <input
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  placeholder="admin.acme.com"
                />
              </div>
              <button
                onClick={createDomain}
                disabled={!canCreateDomain || isSubmitting}
                className="rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm font-medium disabled:opacity-50"
              >
                {isSubmitting ? "Saving..." : "Attach Domain"}
              </button>
            </section>
          )}

          {stage === "done" && (
            <section className="space-y-4">
              <h2 className="text-lg font-medium">3. Verify DNS</h2>
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
