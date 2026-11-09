import "server-only";
import { getOrganizationTimeZone } from "@/config/env";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import { durationSeconds } from "@/modules/time-tracking/domain";
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
  const groups = new Map<
    string,
    {
      projectId: string;
      clientName: string;
      projectName: string;
      totalSeconds: number;
      people: Map<string, { displayName: string; seconds: number }>;
    }
  >();
  for (const entry of entries) {
    const clippedStart = new Date(Math.max(start.getTime(), entry.startedAt.getTime()));
    const clippedEnd = new Date(Math.min(end.getTime(), entry.endedAt!.getTime()));
    const seconds = durationSeconds(clippedStart, clippedEnd);
    const group = groups.get(entry.project.id) ?? {
      projectId: entry.project.id,
      clientName: entry.project.client.name,
      projectName: entry.project.name,
      totalSeconds: 0,
      people: new Map<string, { displayName: string; seconds: number }>(),
    };
    group.totalSeconds += seconds;
    const person = group.people.get(entry.user.id);
    group.people.set(entry.user.id, {
      displayName: entry.user.displayName,
      seconds: (person?.seconds ?? 0) + seconds,
    });
    groups.set(entry.project.id, group);
  }
  return Array.from(groups.values()).map((group) => ({
    ...group,
    people: Array.from(group.people, ([userId, person]) => ({ userId, ...person })),
  }));
}
