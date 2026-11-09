import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import { listProjectDocuments } from "@/modules/documents/service";
import type { ProjectLogInput, ProjectUpdateInput } from "./schemas";

async function activeProjectScope(actor: Actor, projectId: string, managerOnly = false) {
  const db = getDatabase();
  const user = await db.user.findUnique({
    where: { id: actor.userId },
    select: { active: true },
  });
  if (!user?.active) throw new BusinessError("FORBIDDEN");
  if (actor.roles.includes("ADMINISTRATOR")) return true;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: actor.userId } },
    select: { role: true },
  });
  return Boolean(member && (!managerOnly || member.role === "MANAGER"));
}

export async function getProjectDetail(actor: Actor, projectId: string) {
  const scoped = await activeProjectScope(actor, projectId);
  try {
    requireAllowed(actor, { capability: "READ_PROJECT", scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  const project = await getDatabase().project.findUnique({
    where: { id: projectId },
    include: {
      client: true,
      status: true,
      coder: true,
      developmentContact: true,
      productionContact: true,
      members: {
        include: { user: { select: { displayName: true } } },
        orderBy: { user: { displayName: "asc" } },
      },
      logs: {
        include: { author: { select: { displayName: true } } },
        orderBy: { createdAt: "desc" },
        take: 100,
      },
    },
  });
  if (!project || project.archivedAt) throw new BusinessError("INVALID_TARGET");
  const documents = await listProjectDocuments(actor, projectId);
  const membership = project.members.find((member) => member.userId === actor.userId);
  const canWriteDocuments =
    !actor.roles.includes("AUDITOR") &&
    (actor.roles.includes("ADMINISTRATOR") || Boolean(membership));
  return {
    project,
    documents,
    canWriteDocuments,
    canManage: await activeProjectScope(actor, projectId, true),
  };
}

export async function getProjectEditorOptions(actor: Actor, projectId: string) {
  const scoped = await activeProjectScope(actor, projectId, true);
  try {
    requireAllowed(actor, { capability: "MANAGE_PROJECT", scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  const db = getDatabase();
  const [clients, statuses, people] = await Promise.all([
    db.client.findMany({ where: { archivedAt: null }, orderBy: { name: "asc" } }),
    db.projectStatus.findMany({ orderBy: { name: "asc" } }),
    db.person.findMany({ where: { archivedAt: null }, orderBy: { displayName: "asc" } }),
  ]);
  return { clients, statuses, people };
}

export async function updateProject(actor: Actor, input: ProjectUpdateInput) {
  const scoped = await activeProjectScope(actor, input.id, true);
  try {
    requireAllowed(actor, { capability: "MANAGE_PROJECT", scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  return getDatabase().$transaction(
    async (tx) => {
      const [client, status, coder, developmentContact, productionContact] = await Promise.all([
        tx.client.findUnique({ where: { id: input.clientId } }),
        tx.projectStatus.findUnique({ where: { id: input.statusId } }),
        input.coderId ? tx.person.findUnique({ where: { id: input.coderId } }) : null,
        input.developmentContactId
          ? tx.person.findUnique({ where: { id: input.developmentContactId } })
          : null,
        input.productionContactId
          ? tx.person.findUnique({ where: { id: input.productionContactId } })
          : null,
      ]);
      if (
        !client ||
        client.archivedAt ||
        !status ||
        coder?.archivedAt ||
        coder?.kind === "CONTACT" ||
        developmentContact?.archivedAt ||
        productionContact?.archivedAt
      )
        throw new BusinessError("INVALID_TARGET");
      const { id, version, billingRate, ...rest } = input;
      const updated = await tx.project.updateMany({
        where: { id, version, archivedAt: null },
        data: { ...rest, billingRateCents: billingRate, version: { increment: 1 } },
      });
      if (updated.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "PROJECT_UPDATED",
          resourceType: "Project",
          resourceId: id,
          outcome: "SUCCESS",
          metadata: {},
        },
      });
      return tx.project.findUniqueOrThrow({ where: { id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function addProjectLog(actor: Actor, input: ProjectLogInput) {
  const scoped = await activeProjectScope(actor, input.projectId);
  try {
    requireAllowed(actor, { capability: "WRITE_PROJECT_LOG", scoped });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
  return getDatabase().$transaction(
    async (tx) => {
      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        select: { archivedAt: true },
      });
      if (!project || project.archivedAt) throw new BusinessError("INVALID_TARGET");
      const row = await tx.projectLog.create({
        data: { projectId: input.projectId, authorId: actor.userId, body: input.body },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "PROJECT_LOG_CREATED",
          resourceType: "ProjectLog",
          resourceId: row.id,
          outcome: "SUCCESS",
          metadata: { projectId: input.projectId },
        },
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
