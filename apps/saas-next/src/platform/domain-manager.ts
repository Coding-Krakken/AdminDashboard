export interface DomainVerificationInstructions {
  type: "CNAME" | "TXT";
  name: string;
  value: string;
  notes?: string;
}

export interface ManagedDomainRecord {
  id?: string;
  domain: string;
  verified: boolean;
}

interface VercelAddDomainResponse {
  id?: string;
  verified?: boolean;
  verification?: Array<{
    type: "CNAME" | "TXT";
    domain: string;
    value: string;
    reason?: string;
  }>;
}

function getVercelConfig() {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  return {
    token,
    projectId,
    teamId,
    enabled: Boolean(token && projectId)
  };
}

function buildVerificationFallback(domain: string): DomainVerificationInstructions[] {
  return [
    {
      type: "CNAME",
      name: domain,
      value: "cname.vercel-dns.com",
      notes: `Point ${domain} to cname.vercel-dns.com`
    }
  ];
}

async function vercelRequest<T>(path: string, init: RequestInit): Promise<T> {
  const cfg = getVercelConfig();
  if (!cfg.enabled || !cfg.token || !cfg.projectId) {
    throw new Error("Vercel domain API is not configured.");
  }

  const query = new URLSearchParams();
  if (cfg.teamId) {
    query.set("teamId", cfg.teamId);
  }

  const url = `https://api.vercel.com/v9/projects/${cfg.projectId}${path}${query.toString() ? `?${query.toString()}` : ""}`;

  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      "Content-Type": "application/json",
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Vercel API error (${response.status}): ${text}`);
  }

  return (await response.json()) as T;
}

export async function addCustomDomain(
  domain: string
): Promise<{ vercelDomainId: string | null; verified: boolean; verification: DomainVerificationInstructions[] }> {
  const normalized = domain.trim().toLowerCase();

  try {
    const payload = await vercelRequest<VercelAddDomainResponse>("/domains", {
      method: "POST",
      body: JSON.stringify({ name: normalized })
    });

    const verification = (payload.verification ?? []).map((item) => ({
      type: item.type,
      name: item.domain,
      value: item.value,
      notes: item.reason
    }));

    return {
      vercelDomainId: payload.id ?? null,
      verified: payload.verified === true,
      verification: verification.length > 0 ? verification : buildVerificationFallback(normalized)
    };
  } catch {
    return {
      vercelDomainId: null,
      verified: false,
      verification: buildVerificationFallback(normalized)
    };
  }
}

export async function verifyCustomDomain(
  domain: string
): Promise<{ verified: boolean; verification: DomainVerificationInstructions[] }> {
  const normalized = domain.trim().toLowerCase();

  try {
    const payload = await vercelRequest<VercelAddDomainResponse>(
      `/domains/${encodeURIComponent(normalized)}`,
      { method: "GET" }
    );

    const verification = (payload.verification ?? []).map((item) => ({
      type: item.type,
      name: item.domain,
      value: item.value,
      notes: item.reason
    }));

    return {
      verified: payload.verified === true,
      verification: verification.length > 0 ? verification : buildVerificationFallback(normalized)
    };
  } catch {
    return {
      verified: false,
      verification: buildVerificationFallback(normalized)
    };
  }
}

export async function removeCustomDomain(domain: string): Promise<void> {
  const normalized = domain.trim().toLowerCase();

  try {
    await vercelRequest(`/domains/${encodeURIComponent(normalized)}`, {
      method: "DELETE"
    });
  } catch {
    // Keep delete idempotent when API integration is not configured.
  }
}
