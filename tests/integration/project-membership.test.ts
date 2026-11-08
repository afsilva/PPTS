import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { Actor } from "../../src/modules/authorization/policy";
import { auditMutationFailure } from "../../src/modules/audit/failure";
import { BusinessError } from "../../src/modules/business/errors";
import { assignProjectMember, removeProjectMember } from "../../src/modules/projects/membership";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const marker = randomUUID();
const userIds: string[] = [];
const projectIds: string[] = [];
let clientId: string;
let statusId: string;
let admin: Actor;
let employee: Actor;
let manager: Actor;
let targetId: string;
let inactiveId: string;
let managedProjectId: string;
let unscopedProjectId: string;

async function createUser(label: string, roles: Actor["roles"], active = true) {
  const user = await db.user.create({
    data: {
      issuer: "https://membership.integration.invalid",
      subject: `${marker}-${label}`,
      username: `${label}-${marker}`,
      displayName: `Membership ${label}`,
      email: `${label}-${marker}@integration.invalid`,
      active,
      roles: { create: roles.map((role) => ({ role })) },
      presence: { create: {} },
    },
  });
  userIds.push(user.id);
  return { userId: user.id, roles } satisfies Actor;
}

before(async () => {
  admin = await createUser("admin", ["ADMINISTRATOR"]);
  employee = await createUser("employee", ["EMPLOYEE"]);
  manager = await createUser("manager", ["MANAGER"]);
  targetId = (await createUser("target", ["EMPLOYEE"])).userId;
  inactiveId = (await createUser("inactive", ["EMPLOYEE"], false)).userId;

  const client = await db.client.create({ data: { name: `Membership Client ${marker}` } });
  clientId = client.id;
  const status = await db.projectStatus.create({
    data: { name: `Membership Status ${marker}`, description: "Integration test" },
  });
  statusId = status.id;
  const [managed, unscoped] = await Promise.all([
    db.project.create({
      data: {
        clientId,
        statusId,
        name: `Managed ${marker}`,
        members: { create: { userId: manager.userId, role: "MANAGER" } },
      },
    }),
    db.project.create({
      data: { clientId, statusId, name: `Unscoped ${marker}` },
    }),
  ]);
  managedProjectId = managed.id;
  unscopedProjectId = unscoped.id;
  projectIds.push(managed.id, unscoped.id);
});

after(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
  await db.timeEntry.deleteMany({ where: { userId: { in: userIds } } });
  await db.session.deleteMany({ where: { userId: { in: userIds } } });
  await db.projectMember.deleteMany({
    where: { OR: [{ userId: { in: userIds } }, { projectId: { in: projectIds } }] },
  });
  await db.presence.deleteMany({ where: { userId: { in: userIds } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.client.delete({ where: { id: clientId } });
  await db.projectStatus.delete({ where: { id: statusId } });
  await db.$disconnect();
});

test("administrator assigns and updates active project membership with atomic success audits", async () => {
  const created = await assignProjectMember(admin, {
    projectId: unscopedProjectId,
    userId: targetId,
    role: "CONTRIBUTOR",
  });
  assert.equal(created.role, "CONTRIBUTOR");
  const updated = await assignProjectMember(admin, {
    projectId: unscopedProjectId,
    userId: targetId,
    role: "MANAGER",
  });
  assert.equal(updated.role, "MANAGER");
  assert.equal(
    await db.auditEvent.count({
      where: {
        actorId: admin.userId,
        action: "PROJECT_MEMBER_ASSIGNED",
        resourceType: "ProjectMember",
        outcome: "SUCCESS",
      },
    }),
    2,
  );
});

test("employee and unscoped manager are denied without changing membership", async () => {
  const beforeCount = await db.projectMember.count({
    where: { projectId: managedProjectId, userId: targetId },
  });
  await assert.rejects(
    () =>
      assignProjectMember(employee, {
        projectId: managedProjectId,
        userId: targetId,
        role: "CONTRIBUTOR",
      }),
    /forbidden/,
  );
  await assert.rejects(
    () =>
      assignProjectMember(manager, {
        projectId: unscopedProjectId,
        userId: employee.userId,
        role: "CONTRIBUTOR",
      }),
    /forbidden/,
  );
  assert.equal(
    await db.projectMember.count({ where: { projectId: managedProjectId, userId: targetId } }),
    beforeCount,
  );
});

test("project-scoped manager can assign a member only within managed scope", async () => {
  const membership = await assignProjectMember(manager, {
    projectId: managedProjectId,
    userId: targetId,
    role: "CONTRIBUTOR",
  });
  assert.equal(membership.projectId, managedProjectId);
  assert.equal(membership.userId, targetId);
});

test("project manager removes another member with audit but cannot remove self", async () => {
  await removeProjectMember(manager, { projectId: managedProjectId, userId: targetId });
  assert.equal(
    await db.projectMember.count({ where: { projectId: managedProjectId, userId: targetId } }),
    0,
  );
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: manager.userId, action: "PROJECT_MEMBER_REMOVED" },
    }),
    1,
  );
  await assert.rejects(
    () => removeProjectMember(manager, { projectId: managedProjectId, userId: manager.userId }),
    /invalid_target/,
  );
});

test("inactive user and archived project are rejected with no success audit", async () => {
  const successBefore = await db.auditEvent.count({
    where: { actorId: admin.userId, action: "PROJECT_MEMBER_ASSIGNED", outcome: "SUCCESS" },
  });
  await assert.rejects(
    () =>
      assignProjectMember(admin, {
        projectId: managedProjectId,
        userId: inactiveId,
        role: "CONTRIBUTOR",
      }),
    /invalid_target/,
  );
  await db.project.update({ where: { id: managedProjectId }, data: { archivedAt: new Date() } });
  await assert.rejects(
    () =>
      assignProjectMember(admin, {
        projectId: managedProjectId,
        userId: employee.userId,
        role: "CONTRIBUTOR",
      }),
    /invalid_target/,
  );
  await db.project.update({ where: { id: managedProjectId }, data: { archivedAt: null } });
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: admin.userId, action: "PROJECT_MEMBER_ASSIGNED", outcome: "SUCCESS" },
    }),
    successBefore,
  );
});

test("sanitized membership failure audit stores only stable reason and resource type", async () => {
  await auditMutationFailure(
    employee,
    "PROJECT_MEMBER_ASSIGNED",
    new BusinessError("FORBIDDEN"),
    "ProjectMember",
  );
  const event = await db.auditEvent.findFirstOrThrow({
    where: {
      actorId: employee.userId,
      action: "PROJECT_MEMBER_ASSIGNED",
      outcome: "FAILURE",
    },
    orderBy: { occurredAt: "desc" },
  });
  assert.equal(event.resourceType, "ProjectMember");
  assert.deepEqual(event.metadata, { reason: "FORBIDDEN" });
  assert.equal(event.resourceId, null);
});
