import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  DEFAULT_MAX_ACTIVE_SESSIONS,
  persistCappedSession,
  purgeInactiveSessions,
  SESSION_IDLE_SECONDS,
} from "../../src/auth/session-policy";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for integration tests.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });
const marker = randomUUID();
let userId: string;
const hash = (value: string) => createHash("sha256").update(`${marker}-${value}`).digest("hex");
const record = (name: string, now: Date) => ({
  idHash: hash(name),
  userId,
  expiresAt: new Date(now.getTime() + 8 * 60 * 60 * 1000),
  idTokenHash: hash(`token-${name}`),
  idTokenCipher: `cipher-${name}`,
});

before(async () => {
  userId = (
    await db.user.create({
      data: {
        issuer: "https://sessions.invalid",
        subject: marker,
        username: `session-${marker}`,
        displayName: "Session Test",
        email: `${marker}@sessions.invalid`,
        roles: { create: { role: "EMPLOYEE" } },
      },
    })
  ).id;
});

after(async () => {
  await db.session.deleteMany({ where: { userId } });
  await db.userRole.deleteMany({ where: { userId } });
  await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("session creation serializes concurrent callbacks and enforces the active cap", async () => {
  const now = new Date("2026-11-08T20:00:00.000Z");
  await Promise.all(
    Array.from({ length: DEFAULT_MAX_ACTIVE_SESSIONS + 3 }, (_, index) =>
      persistCappedSession(record(`concurrent-${index}`, now), { now }),
    ),
  );
  const sessions = await db.session.findMany({ where: { userId } });
  assert.equal(sessions.filter((session) => session.revokedAt === null).length, 5);
  assert.equal(sessions.filter((session) => session.revokedAt !== null).length, 3);
});

test("expired and idle sessions are revoked before cap calculation", async () => {
  await db.session.deleteMany({ where: { userId } });
  const now = new Date("2026-11-08T21:00:00.000Z");
  await db.session.createMany({
    data: [
      {
        ...record("expired", now),
        expiresAt: new Date(now.getTime() - 1),
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
      },
      {
        ...record("idle", now),
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000 - 1),
      },
    ],
  });
  await persistCappedSession(record("fresh", now), { now, maxActive: 1 });
  const [expired, idle, fresh] = await Promise.all([
    db.session.findUniqueOrThrow({ where: { idHash: hash("expired") } }),
    db.session.findUniqueOrThrow({ where: { idHash: hash("idle") } }),
    db.session.findUniqueOrThrow({ where: { idHash: hash("fresh") } }),
  ]);
  assert.equal(expired.revokedAt?.toISOString(), now.toISOString());
  assert.equal(idle.revokedAt?.toISOString(), now.toISOString());
  assert.equal(fresh.revokedAt, null);
});

test("maintenance removes revoked, expired, and idle rows but preserves active sessions", async () => {
  await db.session.deleteMany({ where: { userId } });
  const now = new Date("2026-11-08T22:00:00.000Z");
  await db.session.createMany({
    data: [
      { ...record("active", now), createdAt: now, lastSeenAt: now },
      {
        ...record("revoked", now),
        createdAt: now,
        lastSeenAt: now,
        revokedAt: now,
      },
      {
        ...record("purge-expired", now),
        expiresAt: new Date(now.getTime() - 1),
        createdAt: now,
        lastSeenAt: now,
      },
      {
        ...record("purge-idle", now),
        createdAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - SESSION_IDLE_SECONDS * 1000 - 1),
      },
    ],
  });
  const purged = await purgeInactiveSessions(now);
  assert.ok(purged.count >= 3);
  assert.deepEqual(await db.session.findMany({ where: { userId }, select: { idHash: true } }), [
    { idHash: hash("active") },
  ]);
});
