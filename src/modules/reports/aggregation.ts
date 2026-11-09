import { durationSeconds } from "@/modules/time-tracking/domain";

export type MonthlyReportEntry = Readonly<{
  startedAt: Date;
  endedAt: Date;
  user: Readonly<{ id: string; displayName: string }>;
  project: Readonly<{
    id: string;
    name: string;
    client: Readonly<{ name: string }>;
  }>;
}>;

export type MonthlyReportGroup = {
  projectId: string;
  clientName: string;
  projectName: string;
  totalSeconds: number;
  people: Array<{ userId: string; displayName: string; seconds: number }>;
};

/**
 * Aggregate completed entries after clipping every interval to the requested
 * month. Callers remain responsible for authorization and database scoping.
 */
export function aggregateMonthlyEntries(
  entries: readonly MonthlyReportEntry[],
  start: Date,
  end: Date,
): MonthlyReportGroup[] {
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
    const clippedEnd = new Date(Math.min(end.getTime(), entry.endedAt.getTime()));
    const seconds = durationSeconds(clippedStart, clippedEnd);
    if (seconds === 0) continue;
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
