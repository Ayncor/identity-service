-- AlterTable
ALTER TABLE "RefreshToken" ADD COLUMN "userAgent" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "ipAtIssue" TEXT;
ALTER TABLE "RefreshToken" ADD COLUMN "lastUsedAt" TIMESTAMP(3);
ALTER TABLE "RefreshToken" ADD COLUMN "lastUsedFromIp" TEXT;
