import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { prisma } from "@/platform/db";
import { removeCustomDomain } from "@/platform/domain-manager";
import { enforcePlatformAccess } from "@/platform/platform-auth";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; domainId: string }> }
) {
  const blocked = enforcePlatformAccess(request, "platform:domains:delete");
  if (blocked) {
    return blocked;
  }

  const { id, domainId } = await params;
  const domain = await prisma.tenantDomain.findFirst({
    where: {
      id: domainId,
      tenantId: id
    }
  });

  if (!domain) {
    return NextResponse.json({ error: "Domain not found" }, { status: 404 });
  }

  await removeCustomDomain(domain.domain);
  await prisma.tenantDomain.delete({
    where: { id: domain.id }
  });

  return NextResponse.json({ deleted: true });
}
