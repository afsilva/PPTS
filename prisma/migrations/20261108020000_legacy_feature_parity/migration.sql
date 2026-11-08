-- Normalize the remaining legacy PPTS people/project/journal/document concepts.
-- Personal profile fields are intentionally separated from identity and are
-- authorization-protected. Files are represented by opaque keys, never paths.
CREATE TYPE "PersonKind" AS ENUM ('EMPLOYEE', 'CONTACT');
CREATE TYPE "DocumentStatus" AS ENUM ('AVAILABLE', 'REJECTED');

CREATE TABLE "Person" (
  "id" UUID NOT NULL,
  "userId" UUID,
  "kind" "PersonKind" NOT NULL DEFAULT 'EMPLOYEE',
  "displayName" VARCHAR(160) NOT NULL,
  "title" VARCHAR(120) NOT NULL DEFAULT '',
  "address" VARCHAR(500) NOT NULL DEFAULT '',
  "workPhone" VARCHAR(40) NOT NULL DEFAULT '',
  "homePhone" VARCHAR(40) NOT NULL DEFAULT '',
  "mobilePhone" VARCHAR(40) NOT NULL DEFAULT '',
  "legacyIm" VARCHAR(80) NOT NULL DEFAULT '',
  "birthdayMonth" INTEGER,
  "birthdayDay" INTEGER,
  CONSTRAINT "Person_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Person_userId_key" UNIQUE ("userId"),
  CONSTRAINT "Person_birthdayMonth_check" CHECK ("birthdayMonth" IS NULL OR "birthdayMonth" BETWEEN 1 AND 12),
  CONSTRAINT "Person_birthdayDay_check" CHECK ("birthdayDay" IS NULL OR "birthdayDay" BETWEEN 1 AND 31),
  CONSTRAINT "Person_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE
);
CREATE INDEX "Person_kind_displayName_idx" ON "Person"("kind", "displayName");

ALTER TABLE "Project"
  ADD COLUMN "languages" VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN "modules" VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN "extras" VARCHAR(1000) NOT NULL DEFAULT '',
  ADD COLUMN "developmentServerName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "developmentServerPath" VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN "productionServerName" VARCHAR(255) NOT NULL DEFAULT '',
  ADD COLUMN "productionServerPath" VARCHAR(500) NOT NULL DEFAULT '',
  ADD COLUMN "estimatedDesignMinutes" INTEGER,
  ADD COLUMN "estimatedCodingMinutes" INTEGER,
  ADD COLUMN "estimatedManagementMinutes" INTEGER,
  ADD COLUMN "estimatedTestingMinutes" INTEGER,
  ADD COLUMN "estimatedMaintenanceMinutes" INTEGER,
  ADD COLUMN "coderId" UUID,
  ADD COLUMN "developmentContactId" UUID,
  ADD COLUMN "productionContactId" UUID,
  ADD CONSTRAINT "Project_estimates_nonnegative" CHECK (
    ("estimatedDesignMinutes" IS NULL OR "estimatedDesignMinutes" >= 0) AND
    ("estimatedCodingMinutes" IS NULL OR "estimatedCodingMinutes" >= 0) AND
    ("estimatedManagementMinutes" IS NULL OR "estimatedManagementMinutes" >= 0) AND
    ("estimatedTestingMinutes" IS NULL OR "estimatedTestingMinutes" >= 0) AND
    ("estimatedMaintenanceMinutes" IS NULL OR "estimatedMaintenanceMinutes" >= 0)
  ),
  ADD CONSTRAINT "Project_coderId_fkey" FOREIGN KEY ("coderId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_developmentContactId_fkey" FOREIGN KEY ("developmentContactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "Project_productionContactId_fkey" FOREIGN KEY ("productionContactId") REFERENCES "Person"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "Project_coderId_idx" ON "Project"("coderId");
CREATE INDEX "Project_developmentContactId_idx" ON "Project"("developmentContactId");
CREATE INDEX "Project_productionContactId_idx" ON "Project"("productionContactId");

CREATE TABLE "ProjectLog" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "authorId" UUID NOT NULL,
  "body" VARCHAR(5000) NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectLog_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectLog_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectLog_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectLog_projectId_createdAt_idx" ON "ProjectLog"("projectId", "createdAt");

CREATE TABLE "ProjectDocument" (
  "id" UUID NOT NULL,
  "projectId" UUID NOT NULL,
  "uploadedById" UUID NOT NULL,
  "objectKey" VARCHAR(255) NOT NULL,
  "originalName" VARCHAR(255) NOT NULL,
  "mediaType" VARCHAR(100) NOT NULL,
  "sizeBytes" INTEGER NOT NULL,
  "sha256" CHAR(64) NOT NULL,
  "status" "DocumentStatus" NOT NULL DEFAULT 'AVAILABLE',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDocument_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ProjectDocument_objectKey_key" UNIQUE ("objectKey"),
  CONSTRAINT "ProjectDocument_size_check" CHECK ("sizeBytes" >= 0),
  CONSTRAINT "ProjectDocument_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ProjectDocument_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocument_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE INDEX "ProjectDocument_projectId_createdAt_idx" ON "ProjectDocument"("projectId", "createdAt");
