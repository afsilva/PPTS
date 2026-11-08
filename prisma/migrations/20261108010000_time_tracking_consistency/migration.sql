-- Presence is a current snapshot: only active work may retain a project.
-- Historical project association remains on TimeEntry records. Reconcile every
-- state that was legal before these constraints so upgrades do not fail on
-- previously permitted rows.
WITH open_entry AS (
  SELECT "userId", "projectId"
  FROM "TimeEntry"
  WHERE "endedAt" IS NULL
)
UPDATE "Presence" AS p
SET "state" = 'WORKING',
    "projectId" = open_entry."projectId"
FROM open_entry
WHERE p."userId" = open_entry."userId";

UPDATE "Presence"
SET "state" = 'OFF_DUTY',
    "projectId" = NULL,
    "message" = ''
WHERE "state" = 'WORKING' AND "projectId" IS NULL;

UPDATE "Presence"
SET "projectId" = NULL
WHERE "state" <> 'WORKING';

UPDATE "Presence"
SET "version" = 1
WHERE "version" <= 0;

UPDATE "TimeEntry"
SET "version" = 1
WHERE "version" <= 0;

ALTER TABLE "Presence"
  ADD CONSTRAINT "Presence_state_project_consistency"
  CHECK (
    ("state" = 'WORKING' AND "projectId" IS NOT NULL)
    OR ("state" IN ('OFF_DUTY', 'AVAILABLE') AND "projectId" IS NULL)
  );

ALTER TABLE "Presence"
  ADD CONSTRAINT "Presence_positive_version"
  CHECK ("version" > 0);

ALTER TABLE "TimeEntry"
  ADD CONSTRAINT "TimeEntry_positive_version"
  CHECK ("version" > 0);
