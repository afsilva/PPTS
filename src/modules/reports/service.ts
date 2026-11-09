import "server-only";
import { getOrganizationTimeZone } from "@/config/env";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import { aggregateMonthlyEntries } from "./aggregation";
import { zonedMonthBounds } from "./timezone";

export function monthBounds(year: number, month: number, timeZone = getOrganizationTimeZone()) {
  try {
    return zonedMonthBounds(year, month, timeZone);
  } catch {
    throw new BusinessError("INVALID_TARGET");
  }
}

export async function getMonthlyReport(actor: Actor, year: number, month: number) {
  const actorRecord = await getDatabase().user.findUnique({
    where: { id: actor.userId },
    select: { active: true },
  });
  if (!actorRecord?.active) throw new BusinessError("FORBIDDEN");
  const scoped = actor.roles.includes("MANAGER");
  try {
    requireAllowed(actor, { capability: "READ_REPORTS", scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  const { start, end } = monthBounds(year, month);
  const entries = await getDatabase().timeEntry.findMany({
    where: {
      endedAt: { not: null, gt: start },
      startedAt: { lt: end },
      ...(actor.roles.includes("ADMINISTRATOR") || actor.roles.includes("AUDITOR")
        ? {}
        : { project: { members: { some: { userId: actor.userId, role: "MANAGER" } } } }),
    },
    orderBy: [
      { project: { client: { name: "asc" } } },
      { project: { name: "asc" } },
      { user: { displayName: "asc" } },
    ],
    select: {
      startedAt: true,
      endedAt: true,
      user: { select: { id: true, displayName: true } },
      project: { select: { id: true, name: true, client: { select: { name: true } } } },
    },
  });
  return aggregateMonthlyEntries(
    entries.map((entry) => ({ ...entry, endedAt: entry.endedAt! })),
    start,
    end,
  );
}
