import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { Actor } from "../../src/modules/authorization/policy";
import {
  deleteProjectDocument,
  listProjectDocuments,
  uploadProjectDocument,
} from "../../src/modules/documents/service";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for integration tests.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const marker = randomUUID();
const storage = await mkdtemp(join(tmpdir(), "ppts-documents-"));
process.env.DOCUMENT_STORAGE_ROOT = storage;
process.env.DOCUMENT_RETENTION_DAYS = "0";
let admin: Actor, member: Actor, outsider: Actor, inactiveMember: Actor;
let projectId: string, clientId: string, statusId: string;
const userIds: string[] = [];

before(async () => {
  for (const [role, active] of [
    ["ADMINISTRATOR", true],
    ["EMPLOYEE", true],
    ["EMPLOYEE", true],
    ["EMPLOYEE", false],
  ] as const) {
    const user = await db.user.create({
      data: {
        issuer: "https://documents.invalid",
        subject: `${role}-${userIds.length}-${marker}`,
        username: `${role}-${userIds.length}-${marker}`,
        displayName: `Document ${role} ${userIds.length}`,
        email: `${role}-${userIds.length}@invalid.test`,
        active,
        roles: { create: { role } },
      },
    });
    userIds.push(user.id);
  }
  admin = { userId: userIds[0], roles: ["ADMINISTRATOR"] };
  member = { userId: userIds[1], roles: ["EMPLOYEE"] };
  outsider = { userId: userIds[2], roles: ["EMPLOYEE"] };
  inactiveMember = { userId: userIds[3], roles: ["EMPLOYEE"] };
  const client = await db.client.create({ data: { name: `Document Client ${marker}` } });
  const status = await db.projectStatus.create({ data: { name: `Document Status ${marker}` } });
  clientId = client.id;
  statusId = status.id;
  const project = await db.project.create({
    data: {
      clientId,
      statusId,
      name: `Document Project ${marker}`,
      members: {
        create: [
          { userId: member.userId, role: "CONTRIBUTOR" },
          { userId: inactiveMember.userId, role: "CONTRIBUTOR" },
        ],
      },
    },
  });
  projectId = project.id;
});

after(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
  await db.projectDocument.deleteMany({ where: { projectId } });
  await db.projectMember.deleteMany({ where: { projectId } });
  await db.project.delete({ where: { id: projectId } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.client.delete({ where: { id: clientId } });
  await db.projectStatus.delete({ where: { id: statusId } });
  await db.$disconnect();
  await rm(storage, { recursive: true, force: true });
});

test("member upload is idempotent, quarantined, private, and atomically audited", async () => {
  const submissionId = randomUUID();
  const input = {
    submissionId,
    originalName: "notes.txt",
    bytes: Buffer.from("private project notes"),
  };
  const row = await uploadProjectDocument(member, projectId, input);
  assert.equal(row.status, "QUARANTINED");
  const replay = await uploadProjectDocument(member, projectId, input);
  assert.equal(replay.id, row.id);
  assert.equal(await db.projectDocument.count({ where: { projectId, submissionId } }), 1);
  assert.equal(
    await db.auditEvent.count({
      where: { action: "DOCUMENT_UPLOAD_QUARANTINED", resourceId: row.id },
    }),
    1,
  );
  assert.equal((await listProjectDocuments(member, projectId))[0].originalName, "notes.txt");
  await assert.rejects(() => listProjectDocuments(outsider, projectId), /forbidden/);
});

test("inactive member cannot use stale project scope", async () => {
  const submissionId = randomUUID();
  await assert.rejects(() => listProjectDocuments(inactiveMember, projectId), /forbidden/);
  await assert.rejects(
    () =>
      uploadProjectDocument(inactiveMember, projectId, {
        submissionId,
        originalName: "inactive.txt",
        bytes: Buffer.from("must not persist"),
      }),
    /forbidden/,
  );
  assert.equal(await db.projectDocument.count({ where: { submissionId } }), 0);
});

test("unscoped upload fails without metadata or audit success", async () => {
  const submissionId = randomUUID();
  await assert.rejects(
    () =>
      uploadProjectDocument(outsider, projectId, {
        submissionId,
        originalName: "denied.txt",
        bytes: Buffer.from("must not persist"),
      }),
    /forbidden/,
  );
  assert.equal(await db.projectDocument.count({ where: { submissionId } }), 0);
});

test("unsupported file fails before reservation", async () => {
  const submissionId = randomUUID();
  await assert.rejects(
    () =>
      uploadProjectDocument(member, projectId, {
        submissionId,
        originalName: "payload.exe",
        bytes: Buffer.from("MZ"),
      }),
    /unsupported_document/,
  );
  assert.equal(await db.projectDocument.count({ where: { submissionId } }), 0);
});

test("delete makes a quarantined document inaccessible and leaves an audited tombstone", async () => {
  const row = await uploadProjectDocument(admin, projectId, {
    submissionId: randomUUID(),
    originalName: "delete.txt",
    bytes: Buffer.from("delete me"),
  });
  const deleted = await deleteProjectDocument(admin, {
    projectId,
    documentId: row.id,
    version: row.version,
  });
  assert.equal(deleted.status, "DELETED");
  assert.equal(
    (await listProjectDocuments(admin, projectId)).some((candidate) => candidate.id === row.id),
    false,
  );
  assert.equal(
    await db.auditEvent.count({
      where: { action: "DOCUMENT_DELETE_REQUESTED", resourceId: row.id },
    }),
    1,
  );
  assert.equal(
    await db.auditEvent.count({ where: { action: "DOCUMENT_PURGED", resourceId: row.id } }),
    1,
  );
});
