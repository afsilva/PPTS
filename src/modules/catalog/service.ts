import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type {
  ArchiveEntityInput,
  ClientCreateInput,
  ClientUpdateInput,
  ProjectCreateInput,
  StatusCreateInput,
  StatusUpdateInput,
  WorkCodeCreateInput,
  WorkCodeUpdateInput,
  WorkCodeStateInput,
} from "./schemas";

function requireCatalogAdmin(actor: Actor) {
  try {
    requireAllowed(actor, { capability: "MANAGE_CLIENTS_AND_CODES" });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
}

export async function getCatalog(actor: Actor) {
  requireCatalogAdmin(actor);
  const db = getDatabase();
  const [clients, statuses, projects, workCodes] = await Promise.all([
    db.client.findMany({ orderBy: { name: "asc" } }),
    db.projectStatus.findMany({ orderBy: { name: "asc" } }),
    db.project.findMany({
      orderBy: [{ client: { name: "asc" } }, { name: "asc" }],
      include: { client: true, status: true },
    }),
    db.workCode.findMany({ orderBy: { name: "asc" } }),
  ]);
  return { clients, statuses, projects, workCodes };
}

function audit(actorId: string, action: string, resourceType: string, resourceId: string) {
  return { actorId, action, resourceType, resourceId, outcome: "SUCCESS", metadata: {} };
}

export async function createClient(actor: Actor, input: ClientCreateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const row = await tx.client.create({ data: { name: input.name } });
      await tx.auditEvent.create({ data: audit(actor.userId, "CLIENT_CREATED", "Client", row.id) });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateClient(actor: Actor, input: ClientUpdateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const result = await tx.client.updateMany({
        where: { id: input.id, version: input.version, archivedAt: null },
        data: { name: input.name, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: audit(actor.userId, "CLIENT_UPDATED", "Client", input.id),
      });
      return tx.client.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createProjectStatus(actor: Actor, input: StatusCreateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const row = await tx.projectStatus.create({ data: input });
      await tx.auditEvent.create({
        data: audit(actor.userId, "PROJECT_STATUS_CREATED", "ProjectStatus", row.id),
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateProjectStatus(actor: Actor, input: StatusUpdateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const result = await tx.projectStatus.updateMany({
        where: { id: input.id, version: input.version },
        data: { name: input.name, description: input.description, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: audit(actor.userId, "PROJECT_STATUS_UPDATED", "ProjectStatus", input.id),
      });
      return tx.projectStatus.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createWorkCode(actor: Actor, input: WorkCodeCreateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const row = await tx.workCode.create({ data: input });
      await tx.auditEvent.create({
        data: audit(actor.userId, "WORK_CODE_CREATED", "WorkCode", row.id),
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updateWorkCode(actor: Actor, input: WorkCodeUpdateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const result = await tx.workCode.updateMany({
        where: { id: input.id, version: input.version },
        data: { name: input.name, description: input.description, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: audit(actor.userId, "WORK_CODE_UPDATED", "WorkCode", input.id),
      });
      return tx.workCode.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function createProject(actor: Actor, input: ProjectCreateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const [client, status] = await Promise.all([
        tx.client.findUnique({ where: { id: input.clientId }, select: { archivedAt: true } }),
        tx.projectStatus.findUnique({ where: { id: input.statusId }, select: { id: true } }),
      ]);
      if (!client || client.archivedAt || !status) throw new BusinessError("INVALID_TARGET");
      const row = await tx.project.create({
        data: {
          clientId: input.clientId,
          statusId: input.statusId,
          name: input.name,
          description: input.description,
          billingRateCents: input.billingRate,
        },
      });
      await tx.auditEvent.create({
        data: audit(actor.userId, "PROJECT_CREATED", "Project", row.id),
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function setArchived(actor: Actor, input: ArchiveEntityInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const archivedAt = new Date();
      if (input.entity === "client") {
        const row = await tx.client.update({ where: { id: input.id }, data: { archivedAt } });
        await tx.auditEvent.create({
          data: audit(actor.userId, "CLIENT_ARCHIVED", "Client", row.id),
        });
        return;
      }
      const row = await tx.project.update({ where: { id: input.id }, data: { archivedAt } });
      await tx.auditEvent.create({
        data: audit(actor.userId, "PROJECT_ARCHIVED", "Project", row.id),
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function setWorkCodeState(actor: Actor, input: WorkCodeStateInput) {
  requireCatalogAdmin(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const changed = await tx.workCode.updateMany({
        where: { id: input.id, version: input.version },
        data: { active: input.active === "true", version: { increment: 1 } },
      });
      if (changed.count !== 1) throw new BusinessError("STALE_VERSION");
      const row = await tx.workCode.findUniqueOrThrow({ where: { id: input.id } });
      await tx.auditEvent.create({
        data: audit(actor.userId, "WORK_CODE_STATE_CHANGED", "WorkCode", row.id),
      });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
