import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { addCustomDomain } from "@/platform/domain-manager";
import { enforcePlatformAccess } from "@/platform/platform-auth";
import { z } from "zod";

const AddDomainSchema = z.object({
  domain: z.string().min(3).max(253).regex(/^[a-z0-9.-]+\.[a-z]{2,}$/),
  isPrimary: z.boolean().default(false)
});

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:domains:list");
  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const domains = await prisma.tenantDomain.findMany({
    where: { tenantId: id }
  });

  return NextResponse.json({ domains });
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:domains:create");
  if (blocked) {
    return blocked;
  }

  const { id } = await params;
  const body = await request.json();
  const normalizedBody =
    typeof body?.domain === "string"
      ? { ...body, domain: body.domain.trim().toLowerCase() }
      : body;
  const parsed = AddDomainSchema.safeParse(normalizedBody);

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const tenant = await prisma.tenant.findUnique({ where: { id } });
  if (!tenant) {
    return NextResponse.json({ error: "Tenant not found" }, { status: 404 });
  }

  const normalizedDomain = parsed.data.domain;

  const existingDomain = await prisma.tenantDomain.findUnique({
    where: { domain: normalizedDomain }
  });
  if (existingDomain) {
    return NextResponse.json(
      { error: "Domain already registered" },
      { status: 409 }
    );
  }

  const domainResult = await addCustomDomain(normalizedDomain);

  const domain = await prisma.tenantDomain.create({
    data: {
      tenantId: id,
      domain: normalizedDomain,
      isPrimary: parsed.data.isPrimary,
      verified: domainResult.verified,
      vercelDomainId: domainResult.vercelDomainId
    }
  });

  return NextResponse.json(
    {
      domain,
      verification: domainResult.verification,
      verified: domainResult.verified
    },
    { status: 201 }
  );
}
