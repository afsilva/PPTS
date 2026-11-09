import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import {
  archivePerson,
  createPerson,
  getAvailableIdentityAccounts,
  linkPersonIdentity,
  unlinkPersonIdentity,
  updatePerson,
} from "../../src/modules/people/service";
import { addProjectLog, getProjectDetail, updateProject } from "../../src/modules/projects/service";
import { projectUpdateSchema } from "../../src/modules/projects/schemas";
import type { Actor } from "../../src/modules/authorization/policy";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required for integration tests.");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const marker = randomUUID();
let admin: Actor, employee: Actor, inactiveManager: Actor;
let projectId: string, clientId: string, statusId: string;
let adminId: string, employeeId: string, inactiveManagerId: string;

before(async () => {
  const [a, e, m] = await Promise.all([
    db.user.create({
      data: {
        issuer: "https://parity.invalid",
        subject: `a-${marker}`,
        username: `a-${marker}`,
        displayName: "Parity Admin",
        email: `a-${marker}@invalid.test`,
        roles: { create: { role: "ADMINISTRATOR" } },
      },
    }),
    db.user.create({
      data: {
        issuer: "https://parity.invalid",
        subject: `e-${marker}`,
        username: `e-${marker}`,
        displayName: "Parity Employee",
        email: `e-${marker}@invalid.test`,
        roles: { create: { role: "EMPLOYEE" } },
      },
    }),
    db.user.create({
      data: {
        issuer: "https://parity.invalid",
        subject: `m-${marker}`,
        username: `m-${marker}`,
        displayName: "Inactive Parity Manager",
        email: `m-${marker}@invalid.test`,
        active: false,
        roles: { create: { role: "MANAGER" } },
      },
    }),
  ]);
  adminId = a.id;
  employeeId = e.id;
  inactiveManagerId = m.id;
  admin = { userId: a.id, roles: ["ADMINISTRATOR"] };
  employee = { userId: e.id, roles: ["EMPLOYEE"] };
  inactiveManager = { userId: m.id, roles: ["MANAGER"] };
  const client = await db.client.create({ data: { name: `Parity Client ${marker}` } });
  clientId = client.id;
  const status = await db.projectStatus.create({ data: { name: `Parity Status ${marker}` } });
  statusId = status.id;
  const project = await db.project.create({
    data: {
      clientId,
      statusId,
      name: `Parity Project ${marker}`,
      members: {
        create: [{ userId: e.id }, { userId: m.id, role: "MANAGER" }],
      },
    },
  });
  projectId = project.id;
});

after(async () => {
  const testUserIds = [adminId, employeeId, inactiveManagerId];
  await db.auditEvent.deleteMany({ where: { actorId: { in: testUserIds } } });
  await db.projectLog.deleteMany({ where: { projectId } });
  await db.projectMember.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.person.deleteMany({ where: { displayName: { startsWith: "Parity" } } });
  await db.userRole.deleteMany({ where: { userId: { in: testUserIds } } });
  await db.user.deleteMany({ where: { id: { in: testUserIds } } });
  await db.client.deleteMany({ where: { id: clientId } });
  await db.projectStatus.deleteMany({ where: { id: statusId } });
  await db.$disconnect();
});

test("administrator creates, version-updates, and archives an unassigned person", async () => {
  const person = await createPerson(admin, {
    submissionId: "00000000-0000-4000-8000-000000000091",
    kind: "CONTACT",
    displayName: "Parity Contact",
    title: "Client",
    address: "",
    workPhone: "",
    homePhone: "",
    mobilePhone: "",
    legacyIm: "",
  });
  const replay = await createPerson(admin, {
    submissionId: "00000000-0000-4000-8000-000000000091",
    kind: "CONTACT",
    displayName: "Should not create another row",
    title: "",
    address: "",
    workPhone: "",
    homePhone: "",
    mobilePhone: "",
    legacyIm: "",
  });
  assert.equal(replay.id, person.id);
  assert.equal(
    await db.person.count({
      where: { createdById: admin.userId, submissionId: "00000000-0000-4000-8000-000000000091" },
    }),
    1,
  );
  const changed = await updatePerson(admin, {
    id: person.id,
    version: person.version,
    kind: "CONTACT",
    displayName: "Parity Contact Updated",
    title: "Client",
    address: "",
    workPhone: "",
    homePhone: "",
    mobilePhone: "",
    legacyIm: "",
  });
  assert.equal(changed.version, 2);
  await assert.rejects(
    () =>
      updatePerson(admin, {
        id: person.id,
        version: 1,
        kind: "CONTACT",
        displayName: "Stale",
        title: "",
        address: "",
        workPhone: "",
        homePhone: "",
        mobilePhone: "",
        legacyIm: "",
      }),
    /stale_version/,
  );
  await archivePerson(admin, { id: person.id, version: 2 });
  assert.ok((await db.person.findUniqueOrThrow({ where: { id: person.id } })).archivedAt);
});

test("administrator links and unlinks one active login while contacts and foreign actors fail closed", async () => {
  const person = await createPerson(admin, {
    submissionId: "00000000-0000-4000-8000-000000000093",
    kind: "EMPLOYEE",
    displayName: "Parity Linked Employee",
    title: "",
    address: "",
    workPhone: "",
    homePhone: "",
    mobilePhone: "",
    legacyIm: "",
  });
  const contact = await createPerson(admin, {
    submissionId: "00000000-0000-4000-8000-000000000094",
    kind: "CONTACT",
    displayName: "Parity Unlinkable Contact",
    title: "",
    address: "",
    workPhone: "",
    homePhone: "",
    mobilePhone: "",
    legacyIm: "",
  });
  assert.ok((await getAvailableIdentityAccounts(admin)).some((user) => user.id === employeeId));
  const linked = await linkPersonIdentity(admin, {
    id: person.id,
    userId: employeeId,
    version: 1,
  });
  assert.equal(linked.userId, employeeId);
  assert.equal(linked.version, 2);
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: adminId, action: "PERSON_IDENTITY_LINKED", resourceId: person.id },
    }),
    1,
  );
  assert.ok(!(await getAvailableIdentityAccounts(admin)).some((user) => user.id === employeeId));
  await assert.rejects(
    () => linkPersonIdentity(admin, { id: contact.id, userId: employeeId, version: 1 }),
    /invalid_target/,
  );
  await assert.rejects(
    () =>
      linkPersonIdentity(employee, {
        id: person.id,
        userId: employeeId,
        version: 2,
      }),
    /forbidden/,
  );
  await assert.rejects(() => archivePerson(admin, { id: person.id, version: 2 }), /entity_in_use/);
  const unlinked = await unlinkPersonIdentity(admin, { id: person.id, version: 2 });
  assert.equal(unlinked.userId, null);
  assert.equal(unlinked.version, 3);
  assert.equal(
    await db.auditEvent.count({
      where: { actorId: adminId, action: "PERSON_IDENTITY_UNLINKED", resourceId: person.id },
    }),
    1,
  );
  await assert.rejects(
    () => unlinkPersonIdentity(admin, { id: person.id, version: 2 }),
    /invalid_target|stale_version/,
  );
});

test("employee cannot administer people", async () => {
  await assert.rejects(
    () =>
      createPerson(employee, {
        submissionId: "00000000-0000-4000-8000-000000000092",
        kind: "EMPLOYEE",
        displayName: "Parity Denied",
        title: "",
        address: "",
        workPhone: "",
        homePhone: "",
        mobilePhone: "",
        legacyIm: "",
      }),
    /forbidden/,
  );
});

test("inactive manager cannot use stale project scope for reads, logs, or updates", async () => {
  await assert.rejects(() => getProjectDetail(inactiveManager, projectId), /forbidden/);
  await assert.rejects(
    () => addProjectLog(inactiveManager, { projectId, body: "Must not persist" }),
    /forbidden/,
  );
  await assert.rejects(
    () =>
      updateProject(inactiveManager, {
        id: projectId,
        version: 1,
        clientId,
        statusId,
        name: `Parity Project ${marker}`,
        description: "Must not persist",
        billingRate: null,
        languages: "",
        modules: "",
        extras: "",
        developmentServerName: "",
        developmentServerPath: "",
        productionServerName: "",
        productionServerPath: "",
      }),
    /forbidden/,
  );
  assert.equal(await db.projectLog.count({ where: { projectId, authorId: inactiveManagerId } }), 0);
  assert.equal((await db.project.findUniqueOrThrow({ where: { id: projectId } })).version, 1);
});

test("project update persists explicit clearing of assigned people", async () => {
  const coder = await db.person.create({
    data: { kind: "EMPLOYEE", displayName: `Parity Coder ${marker}` },
  });
  const developmentContact = await db.person.create({
    data: { kind: "CONTACT", displayName: `Parity Development Contact ${marker}` },
  });
  const productionContact = await db.person.create({
    data: { kind: "CONTACT", displayName: `Parity Production Contact ${marker}` },
  });
  await db.project.update({
    where: { id: projectId },
    data: {
      coderId: coder.id,
      developmentContactId: developmentContact.id,
      productionContactId: productionContact.id,
    },
  });

  const input = projectUpdateSchema.parse({
    id: projectId,
    version: 1,
    clientId,
    statusId,
    name: `Parity Project ${marker}`,
    description: "Relationships cleared",
    billingRate: "",
    languages: "",
    modules: "",
    extras: "",
    developmentServerName: "",
    developmentServerPath: "",
    productionServerName: "",
    productionServerPath: "",
    coderId: "",
    developmentContactId: "",
    productionContactId: "",
  });
  const changed = await updateProject(admin, input);
  assert.equal(changed.version, 2);
  assert.equal(changed.coderId, null);
  assert.equal(changed.developmentContactId, null);
  assert.equal(changed.productionContactId, null);
  const persisted = await db.project.findUniqueOrThrow({ where: { id: projectId } });
  assert.equal(persisted.coderId, null);
  assert.equal(persisted.developmentContactId, null);
  assert.equal(persisted.productionContactId, null);
});

test("project member reads and writes authenticated journal while update remains scoped", async () => {
  const detail = await getProjectDetail(employee, projectId);
  assert.equal(detail.canManage, false);
  const log = await addProjectLog(employee, { projectId, body: "Authenticated project memory" });
  assert.equal(log.authorId, employeeId);
  await assert.rejects(
    () =>
      updateProject(employee, {
        id: projectId,
        version: 1,
        clientId,
        statusId,
        name: `Parity Project ${marker}`,
        description: "",
        billingRate: null,
        languages: "",
        modules: "",
        extras: "",
        developmentServerName: "",
        developmentServerPath: "",
        productionServerName: "",
        productionServerPath: "",
      }),
    /forbidden/,
  );
  const changed = await updateProject(admin, {
    id: projectId,
    version: 2,
    clientId,
    statusId,
    name: `Parity Project ${marker}`,
    description: "Modern detail",
    billingRate: 12500,
    languages: "TypeScript",
    modules: "",
    extras: "",
    developmentServerName: "",
    developmentServerPath: "",
    productionServerName: "",
    productionServerPath: "",
  });
  assert.equal(changed.version, 3);
  assert.equal(changed.billingRateCents, 12500);
});
