import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  clockIn,
  clockOut,
  setAvailable,
  setPresence,
  switchWork,
} from "../../src/modules/time-tracking/service";
import { correctOwnTime } from "../../src/modules/time-tracking/corrections";
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

test("available updates non-working presence and audits", async () => {
  await setAvailable(actor, "Ready for work");
  const presence = await db.presence.findUniqueOrThrow({ where: { userId } });
  assert.equal(presence.state, "AVAILABLE");
  assert.equal(presence.projectId, null);
  assert.equal(presence.message, "Ready for work");
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "PRESENCE_AVAILABLE" } }),
    1,
  );
});

test("off-duty clears available presence and audits", async () => {
  await setPresence(actor, "OFF_DUTY", "untrusted ignored message");
  const presence = await db.presence.findUniqueOrThrow({ where: { userId } });
  assert.equal(presence.state, "OFF_DUTY");
  assert.equal(presence.projectId, null);
  assert.equal(presence.message, "");
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "PRESENCE_OFF_DUTY" } }),
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

test("owner corrects completed time with audit, stale and overlap protection", async () => {
  const first = await db.timeEntry.create({
    data: {
      userId,
      projectId: projectA,
      workCodeId: workCode,
      startedAt: new Date("2026-10-01T08:00:00Z"),
      endedAt: new Date("2026-10-01T09:00:00Z"),
    },
  });
  const second = await db.timeEntry.create({
    data: {
      userId,
      projectId: projectA,
      workCodeId: workCode,
      startedAt: new Date("2026-10-01T10:00:00Z"),
      endedAt: new Date("2026-10-01T11:00:00Z"),
    },
  });
  const corrected = await correctOwnTime(actor, {
    id: first.id,
    version: 1,
    startedAt: "2026-10-01T08:15",
    endedAt: "2026-10-01T09:15",
    note: "Reviewed",
  });
  assert.equal(corrected.version, 2);
  assert.equal(corrected.note, "Reviewed");
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: userId, action: "TIME_CORRECTED", resourceId: first.id },
    }),
    1,
  );
  await assert.rejects(
    () =>
      correctOwnTime(actor, {
        id: first.id,
        version: 1,
        startedAt: "2026-10-01T08:00",
        endedAt: "2026-10-01T09:00",
        note: "Stale",
      }),
    /stale_version/,
  );
  await assert.rejects(
    () =>
      correctOwnTime(actor, {
        id: first.id,
        version: 2,
        startedAt: "2026-10-01T09:30",
        endedAt: "2026-10-01T10:30",
        note: "Overlap",
      }),
    /overlapping_time/,
  );
  const other = await db.user.create({
    data: {
      issuer: "https://integration.invalid",
      subject: `other-${marker}`,
      username: `other-${marker}`,
      displayName: "Other Worker",
      email: `other-${marker}@integration.invalid`,
      roles: { create: { role: "EMPLOYEE" } },
    },
  });
  const foreignCorrection = {
    id: first.id,
    version: 2,
    startedAt: "2026-10-01T08:00",
    endedAt: "2026-10-01T09:00",
    note: "IDOR",
  };
  await assert.rejects(
    () => correctOwnTime({ userId: other.id, roles: ["EMPLOYEE"] }, foreignCorrection),
    /forbidden/,
  );
  await assert.rejects(
    () => correctOwnTime({ userId: other.id, roles: ["MANAGER"] }, foreignCorrection),
    /forbidden/,
  );
  await assert.rejects(
    () => correctOwnTime({ userId: other.id, roles: ["ADMINISTRATOR"] }, foreignCorrection),
    /forbidden/,
  );
  await db.auditEvent.deleteMany({ where: { actorId: other.id } });
  await db.userRole.deleteMany({ where: { userId: other.id } });
  await db.user.delete({ where: { id: other.id } });
  await db.timeEntry.deleteMany({ where: { id: { in: [first.id, second.id] } } });
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
