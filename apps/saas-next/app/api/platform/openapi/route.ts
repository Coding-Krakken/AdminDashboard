import { NextResponse } from "next/server";

const spec = {
  openapi: "3.1.0",
  info: {
    title: "Universal Admin Platform API",
    version: "0.1.0",
    description: "Provisioning API for multi-tenant SaaS admin dashboard"
  },
  servers: [
    {
      url: "/",
      description: "Current deployment"
    }
  ],
  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        bearerFormat: "PLATFORM_ADMIN_SECRET"
      }
    }
  },
  security: [{ bearerAuth: [] }],
  paths: {
    "/api/platform/health": {
      get: {
        summary: "Platform health",
        responses: {
          "200": { description: "Healthy" }
        }
      }
    },
    "/api/platform/tenants": {
      get: {
        summary: "List tenants",
        responses: {
          "200": { description: "Tenants listed" },
          "401": { description: "Unauthorized" },
          "429": { description: "Rate limited" }
        }
      },
      post: {
        summary: "Create tenant",
        responses: {
          "201": { description: "Tenant created" },
          "400": { description: "Validation failed" },
          "401": { description: "Unauthorized" },
          "409": { description: "Duplicate tenant" },
          "429": { description: "Rate limited" }
        }
      }
    },
    "/api/platform/tenants/{id}": {
      get: {
        summary: "Get tenant",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Tenant detail" },
          "401": { description: "Unauthorized" },
          "404": { description: "Tenant not found" },
          "429": { description: "Rate limited" }
        }
      },
      patch: {
        summary: "Update tenant",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Tenant updated" },
          "400": { description: "Validation failed" },
          "401": { description: "Unauthorized" },
          "404": { description: "Tenant not found" },
          "429": { description: "Rate limited" }
        }
      },
      delete: {
        summary: "Delete tenant",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Tenant deleted" },
          "401": { description: "Unauthorized" },
          "404": { description: "Tenant not found" },
          "429": { description: "Rate limited" }
        }
      }
    },
    "/api/platform/tenants/{id}/domains": {
      get: {
        summary: "List tenant domains",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Domains listed" },
          "401": { description: "Unauthorized" },
          "429": { description: "Rate limited" }
        }
      },
      post: {
        summary: "Create tenant domain",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                properties: {
                  domain: { type: "string", description: "Required for domain and both strategies" },
                  isPrimary: { type: "boolean", default: false },
                  accessStrategy: {
                    type: "string",
                    enum: ["domain", "api-alias", "both"],
                    default: "domain"
                  }
                }
              }
            }
          }
        },
        responses: {
          "201": {
            description: "Domain created or alias configured",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    domain: {
                      anyOf: [
                        { type: "null" },
                        {
                          type: "object",
                          properties: {
                            id: { type: "string" },
                            tenantId: { type: "string" },
                            domain: { type: "string" },
                            verified: { type: "boolean" },
                            isPrimary: { type: "boolean" },
                            accessStrategy: {
                              type: "string",
                              enum: ["DOMAIN", "API_ALIAS", "BOTH"]
                            }
                          }
                        }
                      ]
                    },
                    apiAliasPath: { type: "string" },
                    accessStrategy: {
                      type: "string",
                      enum: ["domain", "api-alias", "both"]
                    },
                    verified: { type: "boolean" },
                    message: { type: "string" }
                  }
                }
              }
            }
          },
          "400": { description: "Validation failed" },
          "401": { description: "Unauthorized" },
          "404": { description: "Tenant not found" },
          "409": { description: "Domain already exists" },
          "429": { description: "Rate limited" }
        }
      }
    },
    "/api/platform/tenants/{id}/domains/{domainId}": {
      delete: {
        summary: "Delete tenant domain",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "domainId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Domain deleted" },
          "401": { description: "Unauthorized" },
          "404": { description: "Domain not found" },
          "429": { description: "Rate limited" }
        }
      }
    },
    "/api/platform/tenants/{id}/domains/{domainId}/verify": {
      post: {
        summary: "Verify tenant domain",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "domainId", in: "path", required: true, schema: { type: "string" } }
        ],
        responses: {
          "200": { description: "Verification result" },
          "401": { description: "Unauthorized" },
          "404": { description: "Domain not found" },
          "429": { description: "Rate limited" }
        }
      }
    }
  }
} as const;

export async function GET() {
  return NextResponse.json(spec, {
    status: 200,
    headers: {
      "Content-Type": "application/json"
    }
  });
}
