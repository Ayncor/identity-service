-- CreateTable
CREATE TABLE "Role" (
    "id" UUID NOT NULL,
    "orgId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "permissions" TEXT[],
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Role_orgId_idx" ON "Role"("orgId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_orgId_name_key" ON "Role"("orgId", "name");

-- AddForeignKey
ALTER TABLE "Role" ADD CONSTRAINT "Role_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Insert system roles for all existing organizations
-- ORG_ADMIN role (generate unique ID per org)
INSERT INTO "Role" ("id", "orgId", "name", "permissions", "isSystem", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    o."id",
    'ORG_ADMIN',
    ARRAY['org:read', 'org:manage_members', 'org:manage_roles', 'audit:read', 'channels:manage', 'threads:moderate'],
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o;

-- ORG_MEMBER role (generate unique ID per org)
INSERT INTO "Role" ("id", "orgId", "name", "permissions", "isSystem", "createdAt", "updatedAt")
SELECT 
    gen_random_uuid(),
    o."id",
    'ORG_MEMBER',
    ARRAY['org:read', 'channels:read', 'threads:read', 'threads:write'],
    true,
    CURRENT_TIMESTAMP,
    CURRENT_TIMESTAMP
FROM "Organization" o;

-- Update existing Memberships to point to the correct system roles
-- For ORG_ADMIN memberships (where roleId matches the old fixed UUID)
UPDATE "Membership" m
SET "roleId" = r."id"
FROM "Role" r
WHERE m."roleId"::text = '11111111-1111-1111-1111-111111111111'
  AND r."orgId" = m."orgId"
  AND r."name" = 'ORG_ADMIN';

-- For ORG_MEMBER memberships (where roleId matches the old fixed UUID)
UPDATE "Membership" m
SET "roleId" = r."id"
FROM "Role" r
WHERE m."roleId"::text = '22222222-2222-2222-2222-222222222222'
  AND r."orgId" = m."orgId"
  AND r."name" = 'ORG_MEMBER';

-- For memberships with NULL roleId, assign ORG_MEMBER
UPDATE "Membership" m
SET "roleId" = r."id"
FROM "Role" r
WHERE m."roleId" IS NULL
  AND r."orgId" = m."orgId"
  AND r."name" = 'ORG_MEMBER';

-- AddForeignKey (after roles are created)
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
