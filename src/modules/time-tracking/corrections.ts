import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type { TimeCorrectionInput } from "./schemas";

export function parseUtcMinute(value: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) throw new BusinessError("INVALID_INTERVAL");
  const date = new Date(`${value}:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 16) !== value)
    throw new BusinessError("INVALID_INTERVAL");
  return date;
}

export function validCorrectionInterval(startedAt: Date, endedAt: Date, now = new Date()) {
  return (
    startedAt < endedAt &&
    endedAt <= now &&
    endedAt.getTime() - startedAt.getTime() <= 31 * 86_400_000
  );
}

export async function getOwnTimeHistory(actor: Actor, limit = 50) {
  try {
    requireAllowed(actor, { capability: "VIEW_TIME", targetUserId: actor.userId, scoped: false });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  return getDatabase().timeEntry.findMany({
    where: { userId: actor.userId, endedAt: { not: null } },
    orderBy: { startedAt: "desc" },
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
  const startedAt = parseUtcMinute(input.startedAt);
  const endedAt = parseUtcMinute(input.endedAt);
  if (!validCorrectionInterval(startedAt, endedAt)) throw new BusinessError("INVALID_INTERVAL");
  return getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${actor.userId}::uuid FOR UPDATE`;
      const existing = await tx.timeEntry.findUnique({ where: { id: input.id } });
      if (!existing || existing.userId !== actor.userId || !existing.endedAt)
        throw new BusinessError("FORBIDDEN");
      if (existing.version !== input.version) throw new BusinessError("STALE_VERSION");
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
