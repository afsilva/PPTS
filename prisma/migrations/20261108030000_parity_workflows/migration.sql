-- Archive and optimistic-concurrency metadata for mutable parity workflows.
ALTER TABLE "Person"
  ADD COLUMN "archivedAt" TIMESTAMPTZ(3),
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD CONSTRAINT "Person_version_check" CHECK ("version" > 0);
CREATE INDEX "Person_archivedAt_idx" ON "Person"("archivedAt");

ALTER TABLE "Project"
  ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "Project_version_check" CHECK ("version" > 0);
