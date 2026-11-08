import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type { TimeCorrectionInput } from "./schemas";

const HISTORY_PAGE_SIZE = 20;

/** Parses the exact UTC value rendered by a datetime-local control. */
export function parseUtcTimestamp(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?$/.test(value))
    throw new BusinessError("INVALID_INTERVAL");
  const date = new Date(`${value}Z`);
  if (!Number.isFinite(date.getTime())) throw new BusinessError("INVALID_INTERVAL");
  const canonical = date.toISOString().slice(0, -1);
  const normalized = value.includes(".")
    ? `${value.split(".")[0]}.${value.split(".")[1]!.padEnd(3, "0")}`
    : `${value}.000`;
  if (canonical !== normalized) throw new BusinessError("INVALID_INTERVAL");
  return date;
}

export function validCorrectionInterval(startedAt: Date, endedAt: Date, now = new Date()) {
  return (
    startedAt < endedAt &&
    endedAt <= now &&
    endedAt.getTime() - startedAt.getTime() <= 31 * 86_400_000
  );
}

function authorizeHistory(actor: Actor) {
  try {
    requireAllowed(actor, { capability: "VIEW_TIME", targetUserId: actor.userId, scoped: false });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
}

export async function getOwnTimeHistoryPage(actor: Actor, page = 1) {
  authorizeHistory(actor);
  const safePage = Math.min(Math.max(Math.trunc(page), 1), 10_000);
  const where = { userId: actor.userId, endedAt: { not: null } } as const;
  const db = getDatabase();
  const total = await db.timeEntry.count({ where });
  const entries = await db.timeEntry.findMany({
    where,
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    skip: (safePage - 1) * HISTORY_PAGE_SIZE,
    take: HISTORY_PAGE_SIZE,
    include: { project: { include: { client: true } }, workCode: true },
  });
  return {
    entries,
    page: safePage,
    pageSize: HISTORY_PAGE_SIZE,
    total,
    pageCount: Math.max(1, Math.ceil(total / HISTORY_PAGE_SIZE)),
  };
}

/** Retained for service callers that need a small recent-history list. */
export async function getOwnTimeHistory(actor: Actor, limit = 50) {
  authorizeHistory(actor);
  return getDatabase().timeEntry.findMany({
    where: { userId: actor.userId, endedAt: { not: null } },
    orderBy: [{ startedAt: "desc" }, { id: "desc" }],
    take: Math.min(Math.max(limit, 1), 100),
    include: { project: { include: { client: true } }, workCode: true },
  });
}

export async function correctOwnTime(actor: Actor, input: TimeCorrectionInput) {
  try {
    requireAllowed(actor, {
      capability: "CORRECT_TIME",
      targetUserId: actor.userId,
      scoped: false,
    });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  const startedAt = parseUtcTimestamp(input.startedAt);
  const endedAt = parseUtcTimestamp(input.endedAt);
  if (!validCorrectionInterval(startedAt, endedAt)) throw new BusinessError("INVALID_INTERVAL");
  return getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId}::uuid FOR UPDATE`;
      const existing = await tx.timeEntry.findUnique({ where: { id: input.id } });
      if (!existing || existing.userId !== actor.userId || !existing.endedAt)
        throw new BusinessError("FORBIDDEN");
      if (existing.version !== input.version) throw new BusinessError("STALE_VERSION");

      // A no-op must not create a new version or misleading audit event. This
      // also protects the native no-JavaScript fallback from unchanged saves.
      if (
        existing.startedAt.getTime() === startedAt.getTime() &&
        existing.endedAt.getTime() === endedAt.getTime() &&
        existing.note === input.note
      )
        return existing;

      const overlap = await tx.timeEntry.findFirst({
        where: {
          userId: actor.userId,
          id: { not: input.id },
          startedAt: { lt: endedAt },
          OR: [{ endedAt: null }, { endedAt: { gt: startedAt } }],
        },
        select: { id: true },
      });
      if (overlap) throw new BusinessError("OVERLAPPING_TIME");
      const result = await tx.timeEntry.updateMany({
        where: {
          id: input.id,
          userId: actor.userId,
          version: input.version,
          endedAt: { not: null },
        },
        data: { startedAt, endedAt, note: input.note, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "TIME_CORRECTED",
          resourceType: "TimeEntry",
          resourceId: input.id,
          outcome: "SUCCESS",
          metadata: {
            previousStartedAt: existing.startedAt.toISOString(),
            previousEndedAt: existing.endedAt.toISOString(),
          },
        },
      });
      return tx.timeEntry.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
