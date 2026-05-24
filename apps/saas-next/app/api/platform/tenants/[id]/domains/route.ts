import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { addCustomDomain } from "@/platform/domain-manager";
import { enforcePlatformAccess } from "@/platform/platform-auth";
import { z } from "zod";

const AccessStrategySchema = z.enum(["domain", "api-alias", "both"]);
const DomainPattern = /^[a-z0-9.-]+\.[a-z]{2,}$/;

function toPrismaAccessStrategy(strategy: z.infer<typeof AccessStrategySchema>) {
  if (strategy === "api-alias") {
    return "API_ALIAS" as const;
  }
  if (strategy === "both") {
    return "BOTH" as const;
  }
  return "DOMAIN" as const;
}

const AddDomainSchema = z.object({
  domain: z.string().min(3).max(253).optional(),
  isPrimary: z.boolean().default(false),
  accessStrategy: AccessStrategySchema.optional().default("domain")
}).superRefine((data, ctx) => {
  if (data.accessStrategy === "api-alias") {
    return;
  }

  if (!data.domain || !DomainPattern.test(data.domain)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["domain"],
      message: "A valid domain is required for domain-based onboarding"
    });
  }
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

  const apiAliasPath = `/api/platform/route/${id}`;
  const prismaAccessStrategy = toPrismaAccessStrategy(parsed.data.accessStrategy);

  if (parsed.data.accessStrategy === "api-alias") {
    await prisma.tenantConfig.update({
      where: { tenantId: id },
      data: { preferredAccessStrategy: prismaAccessStrategy }
    });

    return NextResponse.json(
      {
        domain: null,
        verification: [],
        verified: true,
        accessStrategy: parsed.data.accessStrategy,
        apiAliasPath,
        message: "Platform API alias mode enabled"
      },
      { status: 201 }
    );
  }

  const normalizedDomain = parsed.data.domain;
  if (!normalizedDomain) {
    return NextResponse.json({ error: "Domain is required" }, { status: 400 });
  }

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
      vercelDomainId: domainResult.vercelDomainId,
      accessStrategy: prismaAccessStrategy
    }
  });

  await prisma.tenantConfig.update({
    where: { tenantId: id },
    data: { preferredAccessStrategy: prismaAccessStrategy }
  });

  return NextResponse.json(
    {
      domain,
      verification: domainResult.verification,
      verified: domainResult.verified,
      accessStrategy: parsed.data.accessStrategy,
      apiAliasPath
    },
    { status: 201 }
  );
}
