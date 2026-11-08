-- Browser submissions carry a random operation ID. A replay (double-click,
-- retry, proxy replay) returns the original record instead of creating another.
ALTER TABLE "Person"
  ADD COLUMN "createdById" UUID,
  ADD COLUMN "submissionId" UUID;
ALTER TABLE "Person"
  ADD CONSTRAINT "Person_createdById_submissionId_key" UNIQUE ("createdById", "submissionId");
