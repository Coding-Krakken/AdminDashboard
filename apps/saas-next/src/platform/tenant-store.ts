import type { PrismaClient } from "@prisma/client";
import type {
  TenantStoreDelegate,
  TenantRecord,
  TenantConfigRecord,
  TenantThemeRecord,
  TenantDomainRecord
} from "@universal-admin/adapters";

export function createPrismaTenantStore(prisma: PrismaClient): TenantStoreDelegate {
  return {
    async findTenantByDomain(domain: string) {
      const record = await prisma.tenantDomain.findUnique({
        where: { domain },
        include: { tenant: true }
      });
      if (!record) return null;
      return {
        id: record.tenant.id,
        slug: record.tenant.slug,
        name: record.tenant.name,
        status: record.tenant.status as TenantRecord["status"],
        domainVerified: record.verified
      };
    },

    async findTenantBySlug(slug: string) {
      const record = await prisma.tenant.findUnique({ where: { slug } });
      if (!record) return null;
      return {
        id: record.id,
        slug: record.slug,
        name: record.name,
        status: record.status as TenantRecord["status"]
      };
    },

    async findTenantById(id: string) {
      const record = await prisma.tenant.findUnique({ where: { id } });
      if (!record) return null;
      return {
        id: record.id,
        slug: record.slug,
        name: record.name,
        status: record.status as TenantRecord["status"]
      };
    },

    async findConfig(tenantId: string): Promise<TenantConfigRecord | null> {
      const record = await prisma.tenantConfig.findUnique({ where: { tenantId } });
      if (!record) return null;
      return {
        tenantId: record.tenantId,
        dashboardConfig: record.dashboardConfig as unknown as TenantConfigRecord["dashboardConfig"],
        authProvider: record.authProvider,
        authConfig: (record.authConfig as Record<string, unknown>) ?? {},
        businessProfile: record.businessProfile
      };
    },

    async findTheme(tenantId: string): Promise<TenantThemeRecord | null> {
      const record = await prisma.tenantTheme.findUnique({ where: { tenantId } });
      if (!record) return null;
      return {
        tenantId: record.tenantId,
        tokens: (record.tokens as Record<string, string>) ?? {},
        logoUrl: record.logoUrl,
        faviconUrl: record.faviconUrl,
        darkMode: record.darkMode
      };
    },

    async findDomains(tenantId: string): Promise<TenantDomainRecord[]> {
      const records = await prisma.tenantDomain.findMany({ where: { tenantId } });
      return records.map((r) => ({
        tenantId: r.tenantId,
        domain: r.domain,
        verified: r.verified,
        isPrimary: r.isPrimary
      }));
    }
  };
}
