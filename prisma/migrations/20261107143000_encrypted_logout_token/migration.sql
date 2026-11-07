-- RP-initiated logout needs an ID-token hint. Keep it encrypted server-side;
-- invalidate existing sessions that cannot be upgraded truthfully.
DELETE FROM "Session";

ALTER TABLE "Session"
  ADD COLUMN "idTokenCipher" TEXT NOT NULL;
