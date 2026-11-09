import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  clockIn,
  clockOut,
  getDashboard,
  purgeExpiredClockMutationReceipts,
  setAvailable,
  setPresence,
  switchWork,
} from "../../src/modules/time-tracking/service";
import { correctOwnTime, getOwnTimeHistoryPage } from "../../src/modules/time-tracking/corrections";
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
const submissionId = () => randomUUID();

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
  await db.clockMutationReceipt.deleteMany({ where: { userId } });
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
    clockIn(actor, {
      submissionId: submissionId(),
      projectId: projectA,
      workCodeId: workCode,
      message: "First",
    }),
    clockIn(actor, {
      submissionId: submissionId(),
      projectId: projectA,
      workCodeId: workCode,
      message: "Second",
    }),
  ]);
  assert.equal(results.filter((result) => result.status === "fulfilled").length, 1);
  assert.equal(results.filter((result) => result.status === "rejected").length, 1);
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 1);
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "TIME_CLOCK_IN" } }),
    1,
  );
  await clockOut(actor, { submissionId: submissionId() });
});

test("clock-in retry returns one result and conflicting key reuse fails closed", async () => {
  const key = submissionId();
  const command = {
    submissionId: key,
    projectId: projectA,
    workCodeId: workCode,
    message: "Retry safe",
  };
  const firstId = await clockIn(actor, command);
  const replayId = await clockIn(actor, command);
  assert.equal(replayId, firstId);
  assert.equal(await db.timeEntry.count({ where: { id: firstId } }), 1);
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: userId, action: "TIME_CLOCK_IN", resourceId: firstId },
    }),
    1,
  );
  await assert.rejects(
    () => clockIn(actor, { ...command, message: "Conflicting replay" }),
    /idempotency_conflict/,
  );
  await clockOut(actor, { submissionId: submissionId() });
  const expired = await db.clockMutationReceipt.create({
    data: {
      userId,
      submissionId: submissionId(),
      action: "TEST",
      fingerprint: "0".repeat(64),
      createdAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    },
  });
  const purged = await purgeExpiredClockMutationReceipts();
  assert.ok(purged.count >= 1);
  assert.equal(
    await db.clockMutationReceipt.count({
      where: { userId, submissionId: expired.submissionId },
    }),
    0,
  );
  const reusableKey = submissionId();
  await db.clockMutationReceipt.create({
    data: {
      userId,
      submissionId: reusableKey,
      action: "TIME_CLOCK_IN",
      fingerprint: "0".repeat(64),
      createdAt: new Date(Date.now() - 2_000),
      expiresAt: new Date(Date.now() - 1_000),
    },
  });
  const reusedId = await clockIn(actor, {
    submissionId: reusableKey,
    projectId: projectA,
    workCodeId: workCode,
    message: "Expired key reused",
  });
  assert.equal(await db.timeEntry.count({ where: { id: reusedId, endedAt: null } }), 1);
  await clockOut(actor, { submissionId: submissionId() });
  await clockIn(actor, {
    submissionId: submissionId(),
    projectId: projectA,
    workCodeId: workCode,
    message: "Ready to switch",
  });
});

test("switch closes the old entry and opens a new one atomically", async () => {
  const old = await db.timeEntry.findFirstOrThrow({ where: { userId, endedAt: null } });
  const nextId = await switchWork(actor, {
    submissionId: submissionId(),
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

test("switch replay is idempotent and does not create a third entry", async () => {
  const open = await db.timeEntry.findFirstOrThrow({ where: { userId, endedAt: null } });
  const command = {
    submissionId: submissionId(),
    projectId: open.projectId === projectA ? projectB : projectA,
    workCodeId: workCode,
    message: "Replay switch",
  };
  const nextId = await switchWork(actor, command);
  assert.equal(await switchWork(actor, command), nextId);
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 1);
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: userId, action: "TIME_SWITCH", resourceId: nextId },
    }),
    1,
  );
});

test("clock-out replay returns the original result with one audit", async () => {
  const key = submissionId();
  const entryId = await clockOut(actor, { submissionId: key });
  assert.equal(await clockOut(actor, { submissionId: key }), entryId);
  await assert.rejects(
    () =>
      setPresence(actor, {
        submissionId: key,
        state: "AVAILABLE",
        message: "Cross-action conflict",
      }),
    /idempotency_conflict/,
  );
  const [entry, presence] = await Promise.all([
    db.timeEntry.findUniqueOrThrow({ where: { id: entryId } }),
    db.presence.findUniqueOrThrow({ where: { userId } }),
  ]);
  assert.ok(entry.endedAt);
  assert.equal(presence.state, "OFF_DUTY");
  assert.equal(presence.projectId, null);
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: userId, action: "TIME_CLOCK_OUT", resourceId: entryId },
    }),
    1,
  );
});

test("available replay is idempotent and conflicting payload reuse fails closed", async () => {
  const key = submissionId();
  await setAvailable(actor, "Ready for work", key);
  await setAvailable(actor, "Ready for work", key);
  const presence = await db.presence.findUniqueOrThrow({ where: { userId } });
  assert.equal(presence.state, "AVAILABLE");
  assert.equal(presence.projectId, null);
  assert.equal(presence.message, "Ready for work");
  assert.equal(
    await db.auditEvent.count({ where: { actorId: userId, action: "PRESENCE_AVAILABLE" } }),
    1,
  );
  await assert.rejects(() => setAvailable(actor, "Changed replay", key), /idempotency_conflict/);
  assert.equal(
    (await db.presence.findUniqueOrThrow({ where: { userId } })).message,
    "Ready for work",
  );
});

test("off-duty clears available presence and audits", async () => {
  await setPresence(actor, {
    submissionId: submissionId(),
    state: "OFF_DUTY",
    message: "untrusted ignored message",
  });
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
    setAvailable(actor, "Ready", submissionId()),
    clockIn(actor, {
      submissionId: submissionId(),
      projectId: projectA,
      workCodeId: workCode,
      message: "Working",
    }),
  ]);
  const presence = await db.presence.findUniqueOrThrow({ where: { userId } });
  const open = await db.timeEntry.findFirst({ where: { userId, endedAt: null } });
  if (open) {
    assert.equal(presence.state, "WORKING");
    assert.equal(presence.projectId, open.projectId);
    await clockOut(actor, { submissionId: submissionId() });
  } else {
    assert.equal(presence.state, "AVAILABLE");
    assert.equal(presence.projectId, null);
  }
  assert.equal(
    results.some((result) => result.status === "fulfilled"),
    true,
  );
});

test("dashboard totals use organization-local day and Monday-week boundaries", async () => {
  const previousZone = process.env.ORGANIZATION_TIME_ZONE;
  process.env.ORGANIZATION_TIME_ZONE = "America/New_York";
  const ids: string[] = [];
  try {
    const fixtures = [
      ["2026-07-05T12:00:00Z", "2026-07-05T13:00:00Z"],
      ["2026-07-06T04:00:00Z", "2026-07-06T05:00:00Z"],
      ["2026-07-07T03:30:00Z", "2026-07-07T04:30:00Z"],
      ["2026-07-07T23:30:00Z", "2026-07-08T00:30:00Z"],
      ["2026-07-08T03:30:00Z", "2026-07-08T03:40:00Z"],
    ] as const;
    for (const [startedAt, endedAt] of fixtures) {
      const entry = await db.timeEntry.create({
        data: {
          userId,
          projectId: projectA,
          workCodeId: workCode,
          startedAt: new Date(startedAt),
          endedAt: new Date(endedAt),
        },
      });
      ids.push(entry.id);
    }
    const dashboard = await getDashboard(actor, new Date("2026-07-08T03:45:00Z"));
    assert.equal(dashboard.organizationTimeZone, "America/New_York");
    assert.deepEqual(dashboard.today, { seconds: 6_000, entries: 3 });
    assert.deepEqual(dashboard.week, { seconds: 11_400 });
  } finally {
    await db.timeEntry.deleteMany({ where: { id: { in: ids } } });
    if (previousZone === undefined) delete process.env.ORGANIZATION_TIME_ZONE;
    else process.env.ORGANIZATION_TIME_ZONE = previousZone;
  }
});

test("dashboard totals clip correctly across the spring DST transition", async () => {
  const previousZone = process.env.ORGANIZATION_TIME_ZONE;
  process.env.ORGANIZATION_TIME_ZONE = "America/New_York";
  const entry = await db.timeEntry.create({
    data: {
      userId,
      projectId: projectA,
      workCodeId: workCode,
      startedAt: new Date("2026-03-08T04:30:00Z"),
      endedAt: new Date("2026-03-08T08:30:00Z"),
    },
  });
  try {
    const dashboard = await getDashboard(actor, new Date("2026-03-08T12:00:00Z"));
    // Local day starts at 05:00Z before the 02:00 -> 03:00 spring jump.
    assert.deepEqual(dashboard.today, { seconds: 12_600, entries: 1 });
  } finally {
    await db.timeEntry.delete({ where: { id: entry.id } });
    if (previousZone === undefined) delete process.env.ORGANIZATION_TIME_ZONE;
    else process.env.ORGANIZATION_TIME_ZONE = previousZone;
  }
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
    startedAt: "2026-10-01T08:15:00.000",
    endedAt: "2026-10-01T09:15:00.000",
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
        startedAt: "2026-10-01T08:00:00.000",
        endedAt: "2026-10-01T09:00:00.000",
        note: "Stale",
      }),
    /stale_version/,
  );
  await assert.rejects(
    () =>
      correctOwnTime(actor, {
        id: first.id,
        version: 2,
        startedAt: "2026-10-01T09:30:00.000",
        endedAt: "2026-10-01T10:30:00.000",
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
    startedAt: "2026-10-01T08:00:00.000",
    endedAt: "2026-10-01T09:00:00.000",
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

test("unchanged correction preserves millisecond precision without version or audit changes", async () => {
  const entry = await db.timeEntry.create({
    data: {
      userId,
      projectId: projectA,
      workCodeId: workCode,
      startedAt: new Date("2026-10-02T08:15:42.731Z"),
      endedAt: new Date("2026-10-02T09:16:03.112Z"),
      note: "Exact",
    },
  });
  const beforeAudits = await db.auditEvent.count({
    where: { actorId: userId, action: "TIME_CORRECTED", resourceId: entry.id },
  });
  const unchanged = await correctOwnTime(actor, {
    id: entry.id,
    version: entry.version,
    startedAt: "2026-10-02T08:15:42.731",
    endedAt: "2026-10-02T09:16:03.112",
    note: "Exact",
  });
  assert.equal(unchanged.version, entry.version);
  assert.equal(unchanged.startedAt.toISOString(), "2026-10-02T08:15:42.731Z");
  assert.equal(unchanged.endedAt?.toISOString(), "2026-10-02T09:16:03.112Z");
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: userId, action: "TIME_CORRECTED", resourceId: entry.id },
    }),
    beforeAudits,
  );
  await db.timeEntry.delete({ where: { id: entry.id } });
});

test("own time history paginates beyond the first 50 completed entries", async () => {
  const ids: string[] = [];
  for (let index = 0; index < 51; index += 1) {
    const day = new Date(Date.UTC(2026, 0, 1 + index, 8, 0, 0));
    const created = await db.timeEntry.create({
      data: {
        userId,
        projectId: projectA,
        workCodeId: workCode,
        startedAt: day,
        endedAt: new Date(day.getTime() + 3_600_000),
      },
    });
    ids.push(created.id);
  }
  const first = await getOwnTimeHistoryPage(actor, 1);
  const third = await getOwnTimeHistoryPage(actor, 3);
  assert.equal(first.entries.length, 20);
  assert.ok(first.total >= 51);
  assert.ok(third.entries.length >= 11);
  assert.equal(
    new Set([...first.entries, ...third.entries].map((entry) => entry.id)).size,
    first.entries.length + third.entries.length,
  );
  assert.ok(third.entries.some((entry) => ids.includes(entry.id)));
  await db.timeEntry.deleteMany({ where: { id: { in: ids } } });
});

test("unassigned projects fail closed without creating time or audit rows", async () => {
  const client = await db.client.findFirstOrThrow({ where: { name: `Client ${marker}` } });
  const status = await db.projectStatus.findFirstOrThrow({ where: { name: `Status ${marker}` } });
  const project = await db.project.create({
    data: { clientId: client.id, statusId: status.id, name: `Unassigned ${marker}` },
  });
  await assert.rejects(
    () =>
      clockIn(actor, {
        submissionId: submissionId(),
        projectId: project.id,
        workCodeId: workCode,
        message: "Denied",
      }),
    /invalid_assignment/,
  );
  assert.equal(await db.timeEntry.count({ where: { userId, endedAt: null } }), 0);
  await db.project.delete({ where: { id: project.id } });
});
