import { afterEach, describe, expect, it, vi } from "vitest";
import {
  addCustomDomain,
  verifyCustomDomain,
  removeCustomDomain
} from "../platform/domain-manager";

describe("domain-manager", () => {
  const envSnapshot = {
    VERCEL_API_TOKEN: process.env.VERCEL_API_TOKEN,
    VERCEL_PROJECT_ID: process.env.VERCEL_PROJECT_ID,
    VERCEL_TEAM_ID: process.env.VERCEL_TEAM_ID
  };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env.VERCEL_API_TOKEN = envSnapshot.VERCEL_API_TOKEN;
    process.env.VERCEL_PROJECT_ID = envSnapshot.VERCEL_PROJECT_ID;
    process.env.VERCEL_TEAM_ID = envSnapshot.VERCEL_TEAM_ID;
  });

  it("returns fallback verification when Vercel is not configured", async () => {
    delete process.env.VERCEL_API_TOKEN;
    delete process.env.VERCEL_PROJECT_ID;

    const result = await addCustomDomain("admin.acme.com");

    expect(result.verified).toBe(false);
    expect(result.verification[0]?.value).toBe("cname.vercel-dns.com");
  });

  it("maps Vercel domain response when configured", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project";

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(
        JSON.stringify({
          id: "dom_123",
          verified: false,
          verification: [
            {
              type: "TXT",
              domain: "_vercel.admin.acme.com",
              value: "vc-domain-verify=abc"
            }
          ]
        }),
        { status: 200 }
      )
    );

    const result = await addCustomDomain("admin.acme.com");

    expect(result.vercelDomainId).toBe("dom_123");
    expect(result.verification[0]?.type).toBe("TXT");
  });

  it("verifies domain from API payload", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project";

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ verified: true, verification: [] }), { status: 200 })
    );

    const result = await verifyCustomDomain("admin.acme.com");

    expect(result.verified).toBe(true);
  });

  it("delete is idempotent when API fails", async () => {
    process.env.VERCEL_API_TOKEN = "token";
    process.env.VERCEL_PROJECT_ID = "project";

    vi.spyOn(global, "fetch").mockResolvedValue(
      new Response("boom", { status: 500 })
    );

    await expect(removeCustomDomain("admin.acme.com")).resolves.toBeUndefined();
  });
});
