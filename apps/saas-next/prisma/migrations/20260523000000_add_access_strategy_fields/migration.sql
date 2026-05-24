-- CreateEnum
CREATE TYPE "AccessStrategy" AS ENUM ('DOMAIN', 'API_ALIAS', 'BOTH');

-- AlterTable
ALTER TABLE "TenantConfig"
ADD COLUMN "preferredAccessStrategy" "AccessStrategy" NOT NULL DEFAULT 'DOMAIN';

-- AlterTable
ALTER TABLE "TenantDomain"
ADD COLUMN "accessStrategy" "AccessStrategy" NOT NULL DEFAULT 'DOMAIN';
