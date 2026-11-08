-- Clock and presence commands retain a bounded replay receipt. The unique key
-- is actor-scoped, payload fingerprints contain no submitted text, and the
-- business mutation, receipt, and success audit commit in one transaction.
CREATE TABLE "ClockMutationReceipt" (
  "userId" UUID NOT NULL,
  "submissionId" UUID NOT NULL,
  "action" VARCHAR(40) NOT NULL,
  "fingerprint" CHAR(64) NOT NULL,
  "resourceId" UUID,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "expiresAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "ClockMutationReceipt_pkey" PRIMARY KEY ("userId", "submissionId"),
  CONSTRAINT "ClockMutationReceipt_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ClockMutationReceipt_fingerprint_check"
    CHECK ("fingerprint" ~ '^[0-9a-f]{64}$'),
  CONSTRAINT "ClockMutationReceipt_expiry_check"
    CHECK ("expiresAt" > "createdAt")
);

CREATE INDEX "ClockMutationReceipt_expiresAt_idx"
  ON "ClockMutationReceipt"("expiresAt");
