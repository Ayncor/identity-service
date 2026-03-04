-- AlterTable
ALTER TABLE "Organization" ADD COLUMN "allowedEmailDomains" TEXT[] NOT NULL DEFAULT '{}';
