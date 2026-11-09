import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { getDatabase } from "@/db/client";
import type { Actor } from "@/modules/authorization/policy";
import { requireAllowed } from "@/modules/authorization/policy";
import { BusinessError } from "@/modules/business/errors";
import type { ProjectMembershipInput, ProjectMemberRemoveInput } from "./schemas";

export async function assignProjectMember(actor: Actor, input: ProjectMembershipInput) {
  return getDatabase().$transaction(
    async (tx) => {
      const actorRecord = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { active: true },
      });
      if (!actorRecord?.active) throw new BusinessError("FORBIDDEN");
      const existingScope = actor.roles.includes("ADMINISTRATOR")
        ? null
        : await tx.projectMember.findUnique({
            where: { projectId_userId: { projectId: input.projectId, userId: actor.userId } },
            select: { role: true },
          });
      try {
        requireAllowed(actor, {
          capability: "MANAGE_PROJECT",
          scoped: existingScope?.role === "MANAGER",
        });
      } catch {
        throw new BusinessError("FORBIDDEN");
      }

      const project = await tx.project.findUnique({
        where: { id: input.projectId },
        include: { client: true },
      });
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { active: true },
      });
      if (!project || project.archivedAt || project.client.archivedAt || !user?.active)
        throw new BusinessError("INVALID_TARGET");

      const membership = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: input.projectId, userId: input.userId } },
        update: { role: input.role },
        create: { projectId: input.projectId, userId: input.userId, role: input.role },
      });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "PROJECT_MEMBER_ASSIGNED",
          resourceType: "ProjectMember",
          resourceId: `${membership.projectId}:${membership.userId}`,
          outcome: "SUCCESS",
          metadata: { projectRole: membership.role },
        },
      });
      return membership;
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}

export async function removeProjectMember(actor: Actor, input: ProjectMemberRemoveInput) {
  return getDatabase().$transaction(
    async (tx) => {
      const actorRecord = await tx.user.findUnique({
        where: { id: actor.userId },
        select: { active: true },
      });
      if (!actorRecord?.active) throw new BusinessError("FORBIDDEN");
      const actorScope = actor.roles.includes("ADMINISTRATOR")
        ? null
        : await tx.projectMember.findUnique({
            where: { projectId_userId: { projectId: input.projectId, userId: actor.userId } },
            select: { role: true },
          });
      try {
        requireAllowed(actor, {
          capability: "MANAGE_PROJECT",
          scoped: actorScope?.role === "MANAGER",
        });
      } catch {
        throw new BusinessError("FORBIDDEN");
      }
      const membership = await tx.projectMember.findUnique({
        where: { projectId_userId: input },
        select: { role: true },
      });
      if (!membership) throw new BusinessError("INVALID_TARGET");
      if (input.userId === actor.userId) throw new BusinessError("INVALID_TARGET");
      const openTime = await tx.timeEntry.count({
        where: { projectId: input.projectId, userId: input.userId, endedAt: null },
      });
      if (openTime) throw new BusinessError("ENTITY_IN_USE");
      await tx.projectMember.delete({ where: { projectId_userId: input } });
      await tx.auditEvent.create({
        data: {
          actorId: actor.userId,
          action: "PROJECT_MEMBER_REMOVED",
          resourceType: "ProjectMember",
          resourceId: `${input.projectId}:${input.userId}`,
          outcome: "SUCCESS",
          metadata: { previousProjectRole: membership.role },
        },
      });
    },
    { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
  );
}
