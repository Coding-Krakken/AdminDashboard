import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { removeCustomDomain } from "@/platform/domain-manager";
import { enforcePlatformAccess } from "@/platform/platform-auth";
import { z } from "zod";

const UpdateTenantSchema = z.object({
  name: z.string().min(1).max(256).optional(),
  status: z.enum(["ACTIVE", "SUSPENDED", "PROVISIONING"]).optional(),
  businessProfile: z.string().optional(),
  authProvider: z.string().optional(),
  authConfig: z.record(z.unknown()).optional(),
  dashboardConfig: z.object({
    modules: z.array(z.any()).optional(),
    flags: z.any().optional(),
    rolePermissions: z.record(z.array(z.string())).optional()
  }).optional(),
  theme: z.object({
    tokens: z.record(z.string()).optional(),
    logoUrl: z.string().nullable().optional(),
    faviconUrl: z.string().nullable().optional(),
    darkMode: z.boolean().optional()
  }).optional()
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:tenants:get");
  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const tenant = await prisma.tenant.findUnique({
    where: { id },
    include: { config: true, theme: true, domains: true }
  });

  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  return NextResponse.json({ tenant });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:tenants:update");
  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const body = await request.json();
  const parsed = UpdateTenantSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const existing = await prisma.tenant.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const { name, status, businessProfile, authProvider, authConfig, dashboardConfig, theme } = parsed.data;

  const tenant = await prisma.$transaction(async (tx) => {
    if (name || status) {
      await tx.tenant.update({
        where: { id },
        data: { ...(name && { name }), ...(status && { status }) }
      });
    }

    if (businessProfile || authProvider || authConfig || dashboardConfig) {
      const configUpdate: Record<string, unknown> = {};
      if (businessProfile) configUpdate.businessProfile = businessProfile;
      if (authProvider) configUpdate.authProvider = authProvider;
      if (authConfig) configUpdate.authConfig = authConfig;
      if (dashboardConfig) configUpdate.dashboardConfig = dashboardConfig;

      await tx.tenantConfig.update({
        where: { tenantId: id },
        data: configUpdate
      });
    }

    if (theme) {
      await tx.tenantTheme.update({
        where: { tenantId: id },
        data: theme
      });
    }

    return tx.tenant.findUnique({
      where: { id },
      include: { config: true, theme: true, domains: true }
    });
  });

  return NextResponse.json({ tenant });
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:tenants:delete");
  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const existing = await prisma.tenant.findUnique({
    where: { id },
    include: { domains: true }
  });
  if (!existing) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  await Promise.all(existing.domains.map(async (domain) => {
    await removeCustomDomain(domain.domain);
  }));

  await prisma.tenant.delete({ where: { id } });

  return NextResponse.json({ deleted: true });
}
