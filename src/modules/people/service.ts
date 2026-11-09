import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type {
  PersonArchiveInput,
  PersonCreateInput,
  PersonLinkInput,
  PersonUnlinkInput,
  PersonUpdateInput,
} from "./schemas";

function authorize(actor: Actor) {
  try {
    requireAllowed(actor, { capability: "MANAGE_PEOPLE_AND_ROLES" });
  } catch {
    throw new BusinessError("FORBIDDEN");
  }
}
const audit = (actorId: string, action: string, resourceId: string) => ({
  actorId,
  action,
  resourceType: "Person",
  resourceId,
  outcome: "SUCCESS",
  metadata: {},
});

export async function getPeople(actor: Actor) {
  authorize(actor);
  return getDatabase().person.findMany({
    orderBy: [{ archivedAt: "asc" }, { displayName: "asc" }],
    include: { user: { select: { id: true, username: true, displayName: true, active: true } } },
  });
}

export async function getAvailableIdentityAccounts(actor: Actor) {
  authorize(actor);
  return getDatabase().user.findMany({
    where: { active: true, person: null },
    orderBy: [{ displayName: "asc" }, { username: "asc" }],
    select: { id: true, username: true, displayName: true },
  });
}

export async function createPerson(actor: Actor, input: PersonCreateInput) {
  authorize(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const { submissionId, ...data } = input;
      const existing = await tx.person.findFirst({
        where: { createdById: actor.userId, submissionId },
      });
      if (existing) return existing;
      const row = await tx.person.create({
        data: { ...data, createdById: actor.userId, submissionId },
      });
      await tx.auditEvent.create({ data: audit(actor.userId, "PERSON_CREATED", row.id) });
      return row;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function updatePerson(actor: Actor, input: PersonUpdateInput) {
  authorize(actor);
  return getDatabase().$transaction(
    async (tx) => {
      const { id, version, ...data } = input;
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${id}::uuid FOR UPDATE`;
      const current = await tx.person.findUnique({ where: { id } });
      if (!current || current.archivedAt || current.version !== version)
        throw new BusinessError("STALE_VERSION");
      if (current.userId && data.kind !== "EMPLOYEE") throw new BusinessError("ENTITY_IN_USE");
      const result = await tx.person.updateMany({
        where: { id, version, archivedAt: null },
        data: { ...data, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({ data: audit(actor.userId, "PERSON_UPDATED", id) });
      return tx.person.findUniqueOrThrow({ where: { id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function linkPersonIdentity(actor: Actor, input: PersonLinkInput) {
  authorize(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.id}::uuid FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "User" WHERE id = ${input.userId}::uuid FOR UPDATE`;
      const person = await tx.person.findUnique({ where: { id: input.id } });
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { id: true, active: true, person: { select: { id: true } } },
      });
      if (!person || person.archivedAt || person.kind !== "EMPLOYEE" || !user || !user.active)
        throw new BusinessError("INVALID_TARGET");
      if (person.version !== input.version) throw new BusinessError("STALE_VERSION");
      if (person.userId || user.person) throw new BusinessError("ENTITY_IN_USE");
      const result = await tx.person.updateMany({
        where: { id: input.id, version: input.version, archivedAt: null, userId: null },
        data: { userId: input.userId, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: {
          ...audit(actor.userId, "PERSON_IDENTITY_LINKED", input.id),
          metadata: { linkedUserId: input.userId },
        },
      });
      return tx.person.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function unlinkPersonIdentity(actor: Actor, input: PersonUnlinkInput) {
  authorize(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.id}::uuid FOR UPDATE`;
      const person = await tx.person.findUnique({ where: { id: input.id } });
      if (!person || person.archivedAt || !person.userId) throw new BusinessError("INVALID_TARGET");
      if (person.version !== input.version) throw new BusinessError("STALE_VERSION");
      const linkedUserId = person.userId;
      const result = await tx.person.updateMany({
        where: { id: input.id, version: input.version, archivedAt: null, userId: linkedUserId },
        data: { userId: null, version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({
        data: {
          ...audit(actor.userId, "PERSON_IDENTITY_UNLINKED", input.id),
          metadata: { unlinkedUserId: linkedUserId },
        },
      });
      return tx.person.findUniqueOrThrow({ where: { id: input.id } });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function archivePerson(actor: Actor, input: PersonArchiveInput) {
  authorize(actor);
  return getDatabase().$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM "Person" WHERE id = ${input.id}::uuid FOR UPDATE`;
      const person = await tx.person.findUnique({
        where: { id: input.id },
        select: { userId: true },
      });
      if (person?.userId) throw new BusinessError("ENTITY_IN_USE");
      const assigned = await tx.project.count({
        where: {
          OR: [
            { coderId: input.id },
            { developmentContactId: input.id },
            { productionContactId: input.id },
          ],
          archivedAt: null,
        },
      });
      if (assigned) throw new BusinessError("ENTITY_IN_USE");
      const result = await tx.person.updateMany({
        where: { id: input.id, version: input.version, archivedAt: null },
        data: { archivedAt: new Date(), version: { increment: 1 } },
      });
      if (result.count !== 1) throw new BusinessError("STALE_VERSION");
      await tx.auditEvent.create({ data: audit(actor.userId, "PERSON_ARCHIVED", input.id) });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
