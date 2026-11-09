import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { Actor } from "../../src/modules/authorization/policy";
import { getAuditEvents } from "../../src/modules/audit/service";
import { getMonthlyReport } from "../../src/modules/reports/service";

process.env.ORGANIZATION_TIME_ZONE = "America/New_York";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for integration tests.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const marker = randomUUID();
const userIds: string[] = [];
const projectIds: string[] = [];
let clientId: string;
let statusId: string;
let workCodeId: string;
let admin: Actor;
let auditor: Actor;
let manager: Actor;
let employee: Actor;
let inactiveManager: Actor;

before(async () => {
  for (const role of ["ADMINISTRATOR", "AUDITOR", "MANAGER", "EMPLOYEE", "EMPLOYEE"] as const) {
    const user = await db.user.create({
      data: {
        issuer: "https://report.invalid",
        subject: `${role}-${userIds.length}-${marker}`,
        username: `${role.toLowerCase()}-${userIds.length}-${marker}`,
        displayName: role === "EMPLOYEE" ? "Duplicate Report Name" : `Report ${role}`,
        email: `${role.toLowerCase()}-${userIds.length}-${marker}@invalid.test`,
        roles: { create: { role } },
      },
    });
    userIds.push(user.id);
    const actor = { userId: user.id, roles: [role] } satisfies Actor;
    if (role === "ADMINISTRATOR") admin = actor;
    else if (role === "AUDITOR") auditor = actor;
    else if (role === "MANAGER") manager = actor;
    else if (!employee) employee = actor;
  }
  const inactive = await db.user.create({
    data: {
      issuer: "https://report.invalid",
      subject: `inactive-manager-${marker}`,
      username: `inactive-manager-${marker}`,
      displayName: "Inactive Report Manager",
      email: `inactive-manager-${marker}@invalid.test`,
      active: false,
      roles: { create: { role: "MANAGER" } },
    },
  });
  userIds.push(inactive.id);
  inactiveManager = { userId: inactive.id, roles: ["MANAGER"] };
  const client = await db.client.create({ data: { name: `Report Client ${marker}` } });
  clientId = client.id;
  const status = await db.projectStatus.create({ data: { name: `Report Status ${marker}` } });
  statusId = status.id;
  const code = await db.workCode.create({ data: { name: `Report Code ${marker}` } });
  workCodeId = code.id;
  for (const [name, scoped] of [
    ["Scoped", true],
    ["Unscoped", false],
  ] as const) {
    const project = await db.project.create({
      data: {
        clientId,
        statusId,
        name: `${name} ${marker}`,
        ...(scoped ? { members: { create: { userId: manager.userId, role: "MANAGER" } } } : {}),
      },
    });
    projectIds.push(project.id);
  }
  await db.timeEntry.createMany({
    data: [
      // March starts at 05:00Z and ends April 1 at 04:00Z in New York.
      {
        userId: userIds[3],
        projectId: projectIds[0],
        workCodeId,
        startedAt: new Date("2026-03-01T04:30:00Z"),
        endedAt: new Date("2026-03-01T05:30:00Z"),
      },
      {
        userId: userIds[3],
        projectId: projectIds[0],
        workCodeId,
        startedAt: new Date("2026-04-01T03:30:00Z"),
        endedAt: new Date("2026-04-01T04:30:00Z"),
      },
      {
        userId: userIds[4],
        projectId: projectIds[0],
        workCodeId,
        startedAt: new Date("2026-03-10T12:00:00Z"),
        endedAt: new Date("2026-03-10T13:00:00Z"),
      },
      {
        userId: userIds[3],
        projectId: projectIds[1],
        workCodeId,
        startedAt: new Date("2026-03-10T12:00:00Z"),
        endedAt: new Date("2026-03-10T14:00:00Z"),
      },
    ],
  });
});

after(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
  await db.timeEntry.deleteMany({ where: { projectId: { in: projectIds } } });
  await db.projectMember.deleteMany({ where: { projectId: { in: projectIds } } });
  await db.project.deleteMany({ where: { id: { in: projectIds } } });
  await db.workCode.delete({ where: { id: workCodeId } });
  await db.client.delete({ where: { id: clientId } });
  await db.projectStatus.delete({ where: { id: statusId } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});

test("report authorization scopes managers while administrators and auditors read all", async () => {
  const managerGroups = await getMonthlyReport(manager, 2026, 3);
  assert.equal(managerGroups.length, 1);
  assert.equal(managerGroups[0].projectId, projectIds[0]);
  assert.equal(managerGroups[0].totalSeconds, 7200);

  const adminGroups = await getMonthlyReport(admin, 2026, 3);
  const auditorGroups = await getMonthlyReport(auditor, 2026, 3);
  assert.equal(adminGroups.length, 2);
  assert.deepEqual(
    auditorGroups.map((group) => group.totalSeconds),
    adminGroups.map((group) => group.totalSeconds),
  );
  await assert.rejects(() => getMonthlyReport(employee, 2026, 3), /forbidden/);
});

test("inactive and unscoped managers cannot read cross-user report data", async () => {
  const unscopedManager = await db.user.create({
    data: {
      issuer: "https://report.invalid",
      subject: `unscoped-manager-${marker}`,
      username: `unscoped-manager-${marker}`,
      displayName: "Unscoped Report Manager",
      email: `unscoped-manager-${marker}@invalid.test`,
      roles: { create: { role: "MANAGER" } },
    },
  });
  userIds.push(unscopedManager.id);
  assert.deepEqual(
    await getMonthlyReport({ userId: unscopedManager.id, roles: ["MANAGER"] }, 2026, 3),
    [],
  );
  // Services normally receive actors only from readSession, which rejects an
  // inactive account. Defense in depth also rejects a direct stale actor.
  await assert.rejects(() => getMonthlyReport(inactiveManager, 2026, 3), /forbidden/);
});

test("report clips organization-local month boundaries and keeps duplicate names separate", async () => {
  const group = (await getMonthlyReport(admin, 2026, 3)).find(
    (candidate) => candidate.projectId === projectIds[0],
  );
  assert.ok(group);
  assert.equal(group.totalSeconds, 7200);
  assert.equal(group.people.length, 2);
  assert.equal(group.people[0].displayName, "Duplicate Report Name");
  assert.notEqual(group.people[0].userId, group.people[1].userId);
  assert.deepEqual(
    group.people.map((person) => person.seconds).sort((a, b) => a - b),
    [3600, 3600],
  );
});

test("administrator audit view is bounded and minimizes arbitrary metadata", async () => {
  const event = await db.auditEvent.create({
    data: {
      actorId: admin.userId,
      action: `REPORT_TEST_${marker}`,
      resourceType: "Report",
      outcome: "FAILURE",
      metadata: { reason: "FORBIDDEN", token: "must-never-render", note: "private" },
    },
  });
  const result = await getAuditEvents(admin, 1);
  const displayed = result.events.find((candidate) => candidate.id === event.id);
  assert.deepEqual(displayed?.metadata, { reason: "FORBIDDEN" });
  assert.ok(result.events.length <= 50);
  await assert.rejects(() => getAuditEvents(employee, 1), /forbidden/);
  await assert.rejects(() => getAuditEvents(auditor, 1), /forbidden/);
});
