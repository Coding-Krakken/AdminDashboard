import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { enforcePlatformAccess } from "@/platform/platform-auth";
import { z } from "zod";

const CreateTenantSchema = z.object({
  slug: z.string().min(2).max(64).regex(/^[a-z0-9-]+$/),
  name: z.string().min(1).max(256),
  businessProfile: z.string().default("generic"),
  authProvider: z.string().default("platform"),
  authConfig: z.record(z.unknown()).default({}),
  dashboardConfig: z.object({
    modules: z.array(z.any()).default([]),
    flags: z.any().default({ global: [], tenant: [], role: [], user: [] }),
    rolePermissions: z.record(z.array(z.string())).default({
      owner: ["*:*"],
      admin: ["dashboard:read", "settings:read", "settings:write"],
      viewer: ["dashboard:read"]
    })
  }).default({
    modules: [],
    flags: { global: [], tenant: [], role: [], user: [] },
    rolePermissions: {
      owner: ["*:*"],
      admin: ["dashboard:read", "settings:read", "settings:write"],
      viewer: ["dashboard:read"]
    }
  }),
  theme: z.object({
    tokens: z.record(z.string()).default({}),
    logoUrl: z.string().nullable().default(null),
    faviconUrl: z.string().nullable().default(null),
    darkMode: z.boolean().default(true)
  }).default({ tokens: {}, logoUrl: null, faviconUrl: null, darkMode: true })
});

export async function GET(request: NextRequest) {
  const blocked = enforcePlatformAccess(request, "platform:tenants:list");
  if (blocked) {
    return blocked;
  }

  const tenants = await prisma.tenant.findMany({
    include: { domains: true },
    orderBy: { createdAt: "desc" }
  });

  return NextResponse.json({ tenants });
}

export async function POST(request: NextRequest) {
  const blocked = enforcePlatformAccess(request, "platform:tenants:create");
  if (blocked) {
    return blocked;
  }

  const body = await request.json();
  const parsed = CreateTenantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const { slug, name, businessProfile, authProvider, authConfig, dashboardConfig, theme } = parsed.data;

  const existing = await prisma.tenant.findUnique({ where: { slug } });
  if (existing) {
    return NextResponse.json(
      { error: "Tenant with this slug already exists" },
      { status: 409 }
    );
  }

  const tenant = await prisma.tenant.create({
    data: {
      slug,
      name,
      status: "ACTIVE",
      config: {
        create: {
          dashboardConfig: dashboardConfig as object,
          authProvider,
          authConfig: authConfig as object,
          businessProfile
        }
      },
      theme: {
        create: {
          tokens: theme.tokens,
          logoUrl: theme.logoUrl,
          faviconUrl: theme.faviconUrl,
          darkMode: theme.darkMode
        }
      }
    },
    include: { config: true, theme: true, domains: true }
  });

  return NextResponse.json({ tenant }, { status: 201 });
}
