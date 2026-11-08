-- Documents are never trusted or downloadable at creation. Bytes first enter a
-- private quarantine boundary and become available only after strict validation
-- and a successful malware scan. Existing metadata-only rows have no trusted
-- backing-object provenance, so they are fail-closed as rejected.
ALTER TYPE "DocumentStatus" RENAME TO "DocumentStatus_old";
CREATE TYPE "DocumentStatus" AS ENUM (
  'UPLOADING',
  'QUARANTINED',
  'SCANNING',
  'SCAN_FAILED',
  'AVAILABLE',
  'REJECTED',
  'DELETE_PENDING',
  'DELETED'
);

ALTER TABLE "ProjectDocument"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "DocumentStatus" USING (
    CASE WHEN "status"::text = 'REJECTED' THEN 'REJECTED'::"DocumentStatus"
         ELSE 'REJECTED'::"DocumentStatus" END
  ),
  ALTER COLUMN "status" SET DEFAULT 'UPLOADING',
  ALTER COLUMN "mediaType" DROP NOT NULL,
  ALTER COLUMN "sizeBytes" TYPE BIGINT,
  ALTER COLUMN "sizeBytes" DROP NOT NULL,
  ALTER COLUMN "sha256" DROP NOT NULL,
  ADD COLUMN "submissionId" UUID,
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "scanAttemptCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "lastFailureCode" VARCHAR(80),
  ADD COLUMN "scannedAt" TIMESTAMPTZ(3),
  ADD COLUMN "availableAt" TIMESTAMPTZ(3),
  ADD COLUMN "retentionUntil" TIMESTAMPTZ(3),
  ADD COLUMN "deleteRequestedAt" TIMESTAMPTZ(3),
  ADD COLUMN "deletedAt" TIMESTAMPTZ(3),
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

DROP TYPE "DocumentStatus_old";
DROP INDEX "ProjectDocument_projectId_createdAt_idx";

-- Prior releases exposed metadata only and never wrote object bytes. Preserve
-- those rows as rejected tombstones while replacing any legacy/path-shaped key
-- with an opaque deterministic value that cannot be interpreted as a path.
UPDATE "ProjectDocument"
SET "objectKey" = md5("id"::text || ':' || "objectKey"),
    "lastFailureCode" = 'MISSING_OR_UNVERIFIED_OBJECT';

ALTER TABLE "ProjectDocument"
  ADD CONSTRAINT "ProjectDocument_project_uploader_submission_key"
    UNIQUE ("projectId", "uploadedById", "submissionId"),
  ADD CONSTRAINT "ProjectDocument_version_check" CHECK ("version" > 0),
  ADD CONSTRAINT "ProjectDocument_scan_attempt_check" CHECK ("scanAttemptCount" >= 0),
  ADD CONSTRAINT "ProjectDocument_size_check_v2" CHECK (
    "sizeBytes" IS NULL OR ("sizeBytes" > 0 AND "sizeBytes" <= 10485760)
  ),
  ADD CONSTRAINT "ProjectDocument_sha256_check_v2" CHECK (
    "sha256" IS NULL OR "sha256" ~ '^[0-9a-f]{64}$'
  ),
  ADD CONSTRAINT "ProjectDocument_key_check" CHECK (
    "objectKey" ~ '^[0-9a-f]{32}$'
  ),
  ADD CONSTRAINT "ProjectDocument_complete_metadata_check" CHECK (
    "status" = 'UPLOADING' OR
    ("mediaType" IS NOT NULL AND "sizeBytes" IS NOT NULL AND "sha256" IS NOT NULL)
  ),
  ADD CONSTRAINT "ProjectDocument_available_check" CHECK (
    "status" <> 'AVAILABLE' OR
    ("scannedAt" IS NOT NULL AND "availableAt" IS NOT NULL AND "deleteRequestedAt" IS NULL)
  ),
  ADD CONSTRAINT "ProjectDocument_deleted_check" CHECK (
    "status" <> 'DELETED' OR "deletedAt" IS NOT NULL
  );

-- Remove obsolete permissive checks after their stricter replacements exist.
ALTER TABLE "ProjectDocument"
  DROP CONSTRAINT IF EXISTS "ProjectDocument_size_check",
  DROP CONSTRAINT IF EXISTS "ProjectDocument_sha256_check";

CREATE INDEX "ProjectDocument_projectId_status_createdAt_idx"
  ON "ProjectDocument"("projectId", "status", "createdAt");
CREATE INDEX "ProjectDocument_status_updatedAt_idx"
  ON "ProjectDocument"("status", "updatedAt");
