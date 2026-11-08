import { after, before, test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../src/generated/prisma/client";
import type { Actor } from "../../src/modules/authorization/policy";
import {
  createClient,
  createProjectStatus,
  createWorkCode,
  setWorkCodeState,
  updateClient,
  updateProjectStatus,
  updateWorkCode,
} from "../../src/modules/catalog/service";
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL required");
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
const marker = randomUUID();
let admin: Actor, employee: Actor;
const userIds: string[] = [];
const ids: { clients: string[]; statuses: string[]; codes: string[] } = {
  clients: [],
  statuses: [],
  codes: [],
};
before(async () => {
  for (const [name, role] of [
    ["admin", "ADMINISTRATOR"],
    ["employee", "EMPLOYEE"],
  ] as const) {
    const u = await db.user.create({
      data: {
        issuer: "https://catalog.invalid",
        subject: `${name}-${marker}`,
        username: `${name}-${marker}`,
        displayName: name,
        email: `${name}-${marker}@invalid.test`,
        roles: { create: { role } },
      },
    });
    userIds.push(u.id);
    if (role === "ADMINISTRATOR") admin = { userId: u.id, roles: [role] };
    else employee = { userId: u.id, roles: [role] };
  }
});
after(async () => {
  await db.auditEvent.deleteMany({ where: { actorId: { in: userIds } } });
  await db.client.deleteMany({ where: { id: { in: ids.clients } } });
  await db.projectStatus.deleteMany({ where: { id: { in: ids.statuses } } });
  await db.workCode.deleteMany({ where: { id: { in: ids.codes } } });
  await db.userRole.deleteMany({ where: { userId: { in: userIds } } });
  await db.user.deleteMany({ where: { id: { in: userIds } } });
  await db.$disconnect();
});
test("administrator edits versioned catalog and stale writes fail", async () => {
  const c = await createClient(admin, { name: `Client ${marker}` });
  ids.clients.push(c.id);
  const s = await createProjectStatus(admin, { name: `Status ${marker}`, description: "one" });
  ids.statuses.push(s.id);
  const w = await createWorkCode(admin, { name: `Code ${marker}`, description: "one" });
  ids.codes.push(w.id);
  const cu = await updateClient(admin, { id: c.id, version: 1, name: `Client updated ${marker}` });
  assert.equal(cu.version, 2);
  await assert.rejects(
    () => updateClient(admin, { id: c.id, version: 1, name: "stale" }),
    /stale_version/,
  );
  const su = await updateProjectStatus(admin, {
    id: s.id,
    version: 1,
    name: `Status ${marker}`,
    description: "two",
  });
  assert.equal(su.version, 2);
  const wu = await updateWorkCode(admin, {
    id: w.id,
    version: 1,
    name: `Code ${marker}`,
    description: "two",
  });
  assert.equal(wu.version, 2);
  const state = await setWorkCodeState(admin, { id: w.id, version: 2, active: "false" });
  assert.equal(state.active, false);
  assert.equal(state.version, 3);
  assert.equal(
    await db.auditEvent.count({
      where: {
        actorId: admin.userId,
        action: {
          in: [
            "CLIENT_UPDATED",
            "PROJECT_STATUS_UPDATED",
            "WORK_CODE_UPDATED",
            "WORK_CODE_STATE_CHANGED",
          ],
        },
      },
    }),
    4,
  );
});
test("employee cannot mutate catalog", async () => {
  await assert.rejects(() => createClient(employee, { name: `Denied ${marker}` }), /forbidden/);
});
