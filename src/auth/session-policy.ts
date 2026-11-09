import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";

export const SESSION_SECONDS = 8 * 60 * 60;
export const SESSION_IDLE_SECONDS = 60 * 60;
export const SESSION_TOUCH_SECONDS = 5 * 60;
export const DEFAULT_MAX_ACTIVE_SESSIONS = 5;

export type SessionRecordInput = {
  idHash: string;
  userId: string;
  expiresAt: Date;
  idTokenHash: string;
  idTokenCipher: string;
};

async function lockUser(tx: Prisma.TransactionClient, userId: string) {
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

/**
 * Creates one session while enforcing a per-user active-session cap. The user
 * row is the serialization point so concurrent callbacks cannot exceed the
 * cap. Oldest sessions are revoked rather than silently reassigned.
 */
export async function persistCappedSession(
  input: SessionRecordInput,
  options: { now?: Date; maxActive?: number } = {},
) {
  const now = options.now ?? new Date();
  const maxActive = options.maxActive ?? DEFAULT_MAX_ACTIVE_SESSIONS;
  if (!Number.isSafeInteger(maxActive) || maxActive < 1 || maxActive > 20)
    throw new Error("invalid_session_cap");
  if (input.expiresAt <= now) throw new Error("invalid_session_expiry");
  const idleCutoff = new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000);

  return getDatabase().$transaction(async (tx) => {
    await lockUser(tx, input.userId);

    // Make stale rows explicitly inactive before calculating the cap. A
    // scheduled purge removes their encrypted provider-token material.
    await tx.session.updateMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        OR: [{ expiresAt: { lte: now } }, { lastSeenAt: { lte: idleCutoff } }],
      },
      data: { revokedAt: now },
    });

    const keep = Math.max(0, maxActive - 1);
    const overflow = await tx.session.findMany({
      where: {
        userId: input.userId,
        revokedAt: null,
        expiresAt: { gt: now },
        lastSeenAt: { gt: idleCutoff },
      },
      orderBy: [{ createdAt: "desc" }, { idHash: "desc" }],
      skip: keep,
      select: { idHash: true },
    });
    if (overflow.length)
      await tx.session.updateMany({
        where: { idHash: { in: overflow.map(({ idHash }) => idHash) }, revokedAt: null },
        data: { revokedAt: now },
      });

    await tx.session.create({
      data: {
        ...input,
        createdAt: now,
        lastSeenAt: now,
      },
    });
    return { revokedCount: overflow.length };
  });
}

/** Deletes session rows that can no longer authenticate a request. */
export async function purgeInactiveSessions(now = new Date()) {
  const idleCutoff = new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000);
  return getDatabase().session.deleteMany({
    where: {
      OR: [
        { revokedAt: { not: null } },
        { expiresAt: { lte: now } },
        { lastSeenAt: { lte: idleCutoff } },
      ],
    },
  });
}
