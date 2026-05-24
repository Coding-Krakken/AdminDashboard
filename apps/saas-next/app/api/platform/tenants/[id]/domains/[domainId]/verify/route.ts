import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { verifyCustomDomain } from "@/platform/domain-manager";
import { enforcePlatformAccess } from "@/platform/platform-auth";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; domainId: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:domains:verify");
  if (blocked) {
    return blocked;
  }

  const { id, domainId } = await params;

  const domain = await prisma.tenantDomain.findFirst({
    where: { id: domainId, tenantId: id }
  });

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  const verification = await verifyCustomDomain(domain.domain);

  const updatedDomain = await prisma.tenantDomain.update({
    where: { id: domainId },
    data: { verified: verification.verified }
  });

  return NextResponse.json({
    domain: updatedDomain,
    verified: verification.verified,
    verification: verification.verification,
    message: verification.verified ? "Domain verified" : "Domain verification pending"
  });
}
