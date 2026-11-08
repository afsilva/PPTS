import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { durationSeconds, durationSince, transitionClock } from "./domain";
import { BusinessError } from "@/modules/business/errors";
import type { ClockSelection } from "./schemas";

function authorizeClock(actor: Actor) {
  try {
    requireAllowed(actor, { capability: "CHANGE_CLOCK", targetUserId: actor.userId });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export async function getDashboard(actor: Actor) {
  requireAllowed(actor, { capability: "VIEW_STATUS_BOARD" });
  const db = getDatabase();
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekStart = new Date(todayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - ((weekStart.getUTCDay() + 6) % 7));

  const canAdministerMemberships =
    actor.roles.includes("ADMINISTRATOR") || actor.roles.includes("MANAGER");
  const [
    user,
    people,
    recentEntries,
    projects,
    workCodes,
    weekEntries,
    todayEntries,
    manageableUsers,
    manageableProjects,
  ] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        displayName: true,
        presence: { select: { state: true, message: true } },
        timeEntries: {
          where: { endedAt: null },
          take: 1,
          select: {
            id: true,
            startedAt: true,
            projectId: true,
            workCodeId: true,
            project: { select: { name: true, client: { select: { name: true } } } },
            workCode: { select: { name: true } },
          },
        },
      },
    }),
    db.user.findMany({
      where: { active: true },
      orderBy: { displayName: "asc" },
      select: {
        displayName: true,
        presence: { select: { state: true, message: true, project: { select: { name: true } } } },
      },
    }),
    db.timeEntry.findMany({
      where: { userId: actor.userId, endedAt: { not: null } },
      orderBy: { startedAt: "desc" },
      take: 5,
      select: {
        id: true,
        startedAt: true,
        endedAt: true,
        project: { select: { name: true } },
        workCode: { select: { name: true } },
      },
    }),
    db.project.findMany({
      where: {
        archivedAt: null,
        client: { archivedAt: null },
        ...(actor.roles.includes("ADMINISTRATOR")
          ? {}
          : { members: { some: { userId: actor.userId } } }),
      },
      orderBy: { name: "asc" },
      select: { id: true, name: true, client: { select: { name: true } } },
    }),
    db.workCode.findMany({
      where: { active: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
    db.timeEntry.findMany({
      where: {
        userId: actor.userId,
        startedAt: { lt: now },
        OR: [{ endedAt: null }, { endedAt: { gt: weekStart } }],
      },
      select: { startedAt: true, endedAt: true },
    }),
    db.timeEntry.findMany({
      where: {
        userId: actor.userId,
        startedAt: { lt: now },
        OR: [{ endedAt: null }, { endedAt: { gt: todayStart } }],
      },
      select: { startedAt: true, endedAt: true },
    }),
    canAdministerMemberships
      ? db.user.findMany({
          where: { active: true },
          orderBy: { displayName: "asc" },
          select: { id: true, displayName: true },
        })
      : Promise.resolve([]),
    actor.roles.includes("ADMINISTRATOR")
      ? db.project.findMany({
          where: { archivedAt: null, client: { archivedAt: null } },
          orderBy: { name: "asc" },
          select: { id: true, name: true, client: { select: { name: true } } },
        })
      : actor.roles.includes("MANAGER")
        ? db.project.findMany({
            where: {
              archivedAt: null,
              client: { archivedAt: null },
              members: { some: { userId: actor.userId, role: "MANAGER" } },
            },
            orderBy: { name: "asc" },
            select: { id: true, name: true, client: { select: { name: true } } },
          })
        : Promise.resolve([]),
  ]);

  const open = user.timeEntries[0] ?? null;
  const todaySeconds = todayEntries.reduce(
    (sum, entry) => sum + durationSince(entry.startedAt, entry.endedAt ?? now, todayStart),
    0,
  );
  const weekSeconds = weekEntries.reduce(
    (sum, entry) => sum + durationSince(entry.startedAt, entry.endedAt ?? now, weekStart),
    0,
  );

  return {
    generatedAt: now,
    user: {
      displayName: user.displayName,
      presence: user.presence?.state ?? "OFF_DUTY",
      message: user.presence?.message ?? "",
    },
    current: open
      ? {
          id: open.id,
          startedAt: open.startedAt,
          projectId: open.projectId,
          projectName: open.project.name,
          clientName: open.project.client.name,
          workCodeId: open.workCodeId,
          workCodeName: open.workCode.name,
        }
      : null,
    today: { seconds: todaySeconds, entries: todayEntries.length },
    week: { seconds: weekSeconds },
    people: people.map((person) => ({
      initials: initials(person.displayName),
      displayName: person.displayName,
      state: person.presence?.state ?? "OFF_DUTY",
      activity: person.presence?.message || person.presence?.project?.name || "",
    })),
    recentEntries: recentEntries.map((entry) => ({
      id: entry.id,
      startedAt: entry.startedAt,
      endedAt: entry.endedAt!,
      projectName: entry.project.name,
      workCodeName: entry.workCode.name,
      seconds: durationSeconds(entry.startedAt, entry.endedAt!),
    })),
    projects: projects.map((project) => ({
      id: project.id,
      name: project.name,
      clientName: project.client.name,
    })),
    workCodes: workCodes.map((code) => ({ id: code.id, name: code.name })),
    manageableUsers,
    manageableProjects: manageableProjects.map((project) => ({
      id: project.id,
      name: project.name,
      clientName: project.client.name,
    })),
  };
}

async function validateAssignment(
  tx: Prisma.TransactionClient,
  actor: Actor,
  input: ClockSelection,
) {
  const user = await tx.user.findUnique({ where: { id: actor.userId }, select: { active: true } });
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { archivedAt: true, client: { select: { archivedAt: true } } },
  });
  const workCode = await tx.workCode.findUnique({
    where: { id: input.workCodeId },
    select: { active: true },
  });
  const membership = actor.roles.includes("ADMINISTRATOR")
    ? true
    : Boolean(
        await tx.projectMember.findUnique({
          where: { projectId_userId: { projectId: input.projectId, userId: actor.userId } },
          select: { userId: true },
        }),
      );
  if (
    !user?.active ||
    !project ||
    project.archivedAt ||
    project.client.archivedAt ||
    !workCode?.active ||
    !membership
  )
    throw new BusinessError("INVALID_ASSIGNMENT");
}

async function currentState(tx: Prisma.TransactionClient, userId: string) {
  const presence = await tx.presence.findUnique({ where: { userId } });
  const openEntry = await tx.timeEntry.findFirst({ where: { userId, endedAt: null } });
  return {
    presence: presence?.state ?? "OFF_DUTY",
    openEntry: openEntry
      ? { projectId: openEntry.projectId, workCodeId: openEntry.workCodeId }
      : null,
  } as const;
}

async function lockActor(tx: Prisma.TransactionClient, userId: string) {
  // All state transitions for one actor serialize on the authoritative user
  // row. The tagged query remains parameterized; the browser never supplies
  // this ID because it comes from the validated server session.
  await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${userId}::uuid FOR UPDATE`;
}

function auditData(actorId: string, action: string, resourceId?: string) {
  return {
    actorId,
    action,
    resourceType: "TimeEntry",
    resourceId,
    outcome: "SUCCESS",
    metadata: {},
  };
}

export async function clockIn(actor: Actor, input: ClockSelection) {
  authorizeClock(actor);
  try {
    return await getDatabase().$transaction(
      async (tx) => {
        await lockActor(tx, actor.userId);
        await validateAssignment(tx, actor, input);
        const state = await currentState(tx, actor.userId);
        try {
          transitionClock(state, { type: "CLOCK_IN", ...input });
        } catch {
          throw new BusinessError("ALREADY_CLOCKED_IN");
        }
        const entry = await tx.timeEntry.create({
          data: {
            userId: actor.userId,
            projectId: input.projectId,
            workCodeId: input.workCodeId,
            startedAt: new Date(),
            note: input.message,
          },
        });
        await tx.presence.upsert({
          where: { userId: actor.userId },
          update: {
            state: "WORKING",
            projectId: input.projectId,
            message: input.message,
            version: { increment: 1 },
          },
          create: {
            userId: actor.userId,
            state: "WORKING",
            projectId: input.projectId,
            message: input.message,
          },
        });
        await tx.auditEvent.create({ data: auditData(actor.userId, "TIME_CLOCK_IN", entry.id) });
        return entry.id;
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  } catch (error) {
    if (error instanceof BusinessError) throw error;
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      (error.code === "P2002" || error.code === "P2034")
    )
      throw new BusinessError("ALREADY_CLOCKED_IN");
    throw error;
  }
}

export async function clockOut(actor: Actor) {
  authorizeClock(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await lockActor(tx, actor.userId);
      const open = await tx.timeEntry.findFirst({ where: { userId: actor.userId, endedAt: null } });
      if (!open) throw new BusinessError("NOT_CLOCKED_IN");
      const endedAt = new Date(Math.max(Date.now(), open.startedAt.getTime() + 1));
      const updated = await tx.timeEntry.updateMany({
        where: { id: open.id, endedAt: null },
        data: { endedAt, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new BusinessError("NOT_CLOCKED_IN");
      await tx.presence.upsert({
        where: { userId: actor.userId },
        update: { state: "OFF_DUTY", projectId: null, message: "", version: { increment: 1 } },
        create: { userId: actor.userId, state: "OFF_DUTY" },
      });
      await tx.auditEvent.create({ data: auditData(actor.userId, "TIME_CLOCK_OUT", open.id) });
      return open.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function switchWork(actor: Actor, input: ClockSelection) {
  authorizeClock(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await lockActor(tx, actor.userId);
      await validateAssignment(tx, actor, input);
      const open = await tx.timeEntry.findFirst({ where: { userId: actor.userId, endedAt: null } });
      if (!open) throw new BusinessError("NOT_CLOCKED_IN");
      if (open.projectId === input.projectId && open.workCodeId === input.workCodeId)
        throw new BusinessError("NO_CHANGE");
      const switchedAt = new Date(Math.max(Date.now(), open.startedAt.getTime() + 1));
      const closed = await tx.timeEntry.updateMany({
        where: { id: open.id, endedAt: null },
        data: { endedAt: switchedAt, version: { increment: 1 } },
      });
      if (closed.count !== 1) throw new BusinessError("NOT_CLOCKED_IN");
      const next = await tx.timeEntry.create({
        data: {
          userId: actor.userId,
          projectId: input.projectId,
          workCodeId: input.workCodeId,
          startedAt: switchedAt,
          note: input.message,
        },
      });
      await tx.presence.update({
        where: { userId: actor.userId },
        data: {
          state: "WORKING",
          projectId: input.projectId,
          message: input.message,
          version: { increment: 1 },
        },
      });
      await tx.auditEvent.create({
        data: {
          ...auditData(actor.userId, "TIME_SWITCH", next.id),
          metadata: { previousEntryId: open.id },
        },
      });
      return next.id;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function setAvailable(actor: Actor, message: string) {
  authorizeClock(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await lockActor(tx, actor.userId);
      const state = await currentState(tx, actor.userId);
      if (state.openEntry) throw new BusinessError("ALREADY_CLOCKED_IN");
      await tx.presence.upsert({
        where: { userId: actor.userId },
        update: { state: "AVAILABLE", projectId: null, message, version: { increment: 1 } },
        create: { userId: actor.userId, state: "AVAILABLE", message },
      });
      await tx.auditEvent.create({ data: auditData(actor.userId, "PRESENCE_AVAILABLE") });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
