-- Optimistic concurrency for administrator catalog editing.
ALTER TABLE "Client" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "Client_version_check" CHECK ("version" > 0);
ALTER TABLE "ProjectStatus" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "ProjectStatus_version_check" CHECK ("version" > 0);
ALTER TABLE "WorkCode" ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1,
  ADD CONSTRAINT "WorkCode_version_check" CHECK ("version" > 0);
