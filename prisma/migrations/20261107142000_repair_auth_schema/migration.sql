-- Repair installations where the sessions migration was applied before
-- idTokenHash and mutable-claim index removal were added to its source file.
-- Existing pre-baseline sessions cannot be assigned a truthful ID-token hash,
-- so invalidate them rather than fabricating security metadata.
DELETE FROM "Session";

ALTER TABLE "Session"
  ADD COLUMN IF NOT EXISTS "idTokenHash" CHAR(64);

ALTER TABLE "Session"
  ALTER COLUMN "idTokenHash" SET NOT NULL;

DROP INDEX IF EXISTS "User_username_key";
DROP INDEX IF EXISTS "User_email_key";
