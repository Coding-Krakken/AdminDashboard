import { describe, expect, it } from "vitest";
import { GET } from "../route";

describe("platform openapi route", () => {
  it("returns OpenAPI spec payload", async () => {
    const response = await GET();
    expect(response.status).toBe(200);

    const payload = await response.json();
    expect(payload.openapi).toBe("3.1.0");
    expect(payload.paths["/api/platform/health"]?.get).toBeDefined();
    expect(payload.paths["/api/platform/tenants"]).toBeDefined();
    expect(
      payload.paths["/api/platform/tenants/{id}/domains"].post.requestBody.content["application/json"]
    ).toBeDefined();
    expect(payload.paths["/api/platform/tenants/{id}/domains/{domainId}"]?.delete).toBeDefined();
    expect(payload.paths["/api/platform/tenants/{id}/domains/{domainId}/verify"]?.post).toBeDefined();
    expect(payload.components.securitySchemes.bearerAuth).toBeDefined();

    expect(
      payload.paths["/api/platform/tenants/{id}/domains/{domainId}/verify"].post.responses["404"]
    ).toBeDefined();
  });
});
