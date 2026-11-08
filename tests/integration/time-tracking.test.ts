import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  clockIn,
  clockOut,
  setAvailable,
  switchWork,
} from "../../src/modules/time-tracking/service";
import type { Actor } from "../../src/modules/authorization/policy";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");

const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const marker = randomUUID();
let actor: Actor;
let userId: string;
let projectA: string;
let projectB: string;
let workCode: string;

before(async () => {
  const user = await db.user.create({
    data: {
      issuer: "https://integration.invalid",
      subject: marker,
      username: `integration-${marker}`,
      displayName: "Integration Worker",
      email: `${marker}@integration.invalid`,
      roles: { create: { role: "EMPLOYEE" } },
      presence: { create: {} },
    },
  });
  userId = user.id;
  actor = { userId, roles: ["EMPLOYEE"] };
  const client = await db.client.create({ data: { name: `Client ${marker}` } });
  const status = await db.projectStatus.create({
    data: { name: `Status ${marker}`, description: "Integration test" },
  });
  const [a, b, code] = await Promise.all([
    db.project.create({
      data: {
        clientId: client.id,
        statusId: status.id,
        name: `Project A ${marker}`,
        members: { create: { userId } },
      },
    }),
    db.project.create({
      data: {
        clientId: client.id,
        statusId: status.id,
        name: `Project B ${marker}`,
        members: { create: { userId } },
      },
    }),
    db.workCode.create({ data: { name: `Code ${marker}`, description: "Integration test" } }),
  ]);
  projectA = a.id;
  projectB = b.id;
  workCode = code.id;
});

after(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: userId } });
  await db.session.deleteMany({ where: { userId } });
  await db.timeEntry.deleteMany({ where: { userId } });
  await db.presence.deleteMany({ where: { userId } });
  await db.projectMember.deleteMany({ where: { userId } });
  await db.userRole.deleteMany({ where: { userId } });
  await db.project.deleteMany({ where: { id: { in: [projectA, projectB] } } });
  await db.workCode.delete({ where: { id: workCode } });
  await db.user.delete({ where: { id: userId } });
  await db.client.deleteMany({ where: { name: `Client ${marker}` } });
  await db.projectStatus.deleteMany({ where: { name: `Status ${marker}` } });
  await db.$disconnect();
});

test("concurrent clock-in leaves exactly one open entry", async () => {
  const results = await Promise.allSettled([
    clockIn(actor, { projectId: projectA, workCodeId: workCode, message: "First" }),
    clockIn(actor, { projectId: projectA, workCodeId: workCode, message: "Second" }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 1);
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "TIME_CLOCK_IN" } }),
    1,
  );
});

test("switch closes the old entry and opens a new one atomically", async () => {
  const old = await db.timeEntry.findFirstOrThrow({ where: { userId, endedAt: null } });
  const nextId = await switchWork(actor, {
    projectId: projectB,
    workCodeId: workCode,
    message: "Switched",
  });
  const [closed, next, presence] = await Promise.all([
    db.timeEntry.findUniqueOrThrow({ where: { id: old.id } }),
    db.timeEntry.findUniqueOrThrow({ where: { id: nextId } }),
    db.presence.findUniqueOrThrow({ where: { userId } }),
  ]);
  assert.ok(closed.endedAt);
  assert.equal(next.endedAt, null);
  assert.equal(next.projectId, projectB);
  assert.equal(presence.state, "WORKING");
  assert.equal(presence.projectId, projectB);
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 1);
});

test("clock-out closes work, clears project presence, and audits", async () => {
  const entryId = await clockOut(actor);
  const [entry, presence] = await Promise.all([
    db.timeEntry.findUniqueOrThrow({ where: { id: entryId } }),
    db.presence.findUniqueOrThrow({ where: { userId } }),
  ]);
  assert.ok(entry.endedAt);
  assert.equal(presence.state, "OFF_DUTY");
  assert.equal(presence.projectId, null);
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "TIME_CLOCK_OUT" } }),
    1,
  );
});

test("concurrent available and clock-in preserve a consistent snapshot", async () => {
  const results = await Promise.allSettled([
    setAvailable(actor, "Ready"),
    clockIn(actor, { projectId: projectA, workCodeId: workCode, message: "Working" }),
  ]);
  const presence = await db.presence.findUniqueOrThrow({ where: { userId } });
  const open = await db.timeEntry.findFirst({ where: { userId, endedAt: null } });
  if (open) {
    assert.equal(presence.state, "WORKING");
    assert.equal(presence.projectId, open.projectId);
    await clockOut(actor);
  } else {
    assert.equal(presence.state, "AVAILABLE");
    assert.equal(presence.projectId, null);
  }
  assert.equal(
    results.some((result) => result.status === "fulfilled"),
    true,
  );
});

test("unassigned projects fail closed without creating time or audit rows", async () => {
  const client = await db.client.findFirstOrThrow({ where: { name: `Client ${marker}` } });
  const status = await db.projectStatus.findFirstOrThrow({ where: { name: `Status ${marker}` } });
  const project = await db.project.create({
    data: { clientId: client.id, statusId: status.id, name: `Unassigned ${marker}` },
  });
  await assert.rejects(
    () => clockIn(actor, { projectId: project.id, workCodeId: workCode, message: "Denied" }),
    /invalid_assignment/,
  );
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 0);
  await db.project.delete({ where: { id: project.id } });
});
