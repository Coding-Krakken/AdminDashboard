import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const tenant = await prisma.tenant.upsert({
    where: { slug: "demo" },
    update: {},
    create: {
      slug: "demo",
      name: "Demo Tenant",
      status: "ACTIVE",
      config: {
        create: {
          dashboardConfig: {
            modules: [],
            flags: { global: [], tenant: [], role: [], user: [] },
            rolePermissions: {
              owner: ["*:*"],
              admin: ["dashboard:read", "settings:read", "settings:write"],
              viewer: ["dashboard:read"]
            }
          },
          authProvider: "platform",
          authConfig: {},
          businessProfile: "generic",
          preferredAccessStrategy: "DOMAIN"
        }
      },
      theme: {
        create: {
          tokens: {
            "color-primary": "hsl(160 56% 55%)",
            "color-background": "hsl(222 47% 6%)",
            "color-foreground": "hsl(210 40% 98%)"
          },
          darkMode: true
        }
      },
      domains: {
        create: {
          domain: "demo.localhost",
          verified: true,
          isPrimary: true,
          accessStrategy: "DOMAIN"
        }
      }
    }
  });

  console.log("Seeded tenant:", tenant.slug);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
