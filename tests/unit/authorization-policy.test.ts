import { test } from "node:test";
import assert from "node:assert/strict";
import { can, requireAllowed, type Actor } from "../../src/modules/authorization/policy";

const actor = (roles: Actor["roles"], userId = "self"): Actor => ({ userId, roles });

test("status board requires a recognized application role", () => {
  assert.equal(can(actor(["EMPLOYEE"]), { capability: "VIEW_STATUS_BOARD" }), true);
  assert.equal(can(actor([]), { capability: "VIEW_STATUS_BOARD" }), false);
});

test("clock changes are own-only and auditors are read-only", () => {
  for (const roles of [["EMPLOYEE"], ["MANAGER"], ["ADMINISTRATOR"]] as const)
    assert.equal(can(actor(roles), { capability: "CHANGE_CLOCK", targetUserId: "self" }), true);
  assert.equal(
    can(actor(["ADMINISTRATOR"]), { capability: "CHANGE_CLOCK", targetUserId: "other" }),
    false,
  );
  assert.equal(
    can(actor(["AUDITOR"]), { capability: "CHANGE_CLOCK", targetUserId: "self" }),
    false,
  );
});

test("time visibility follows own, manager scope, administrator, and auditor scope rules", () => {
  assert.equal(
    can(actor(["EMPLOYEE"]), { capability: "VIEW_TIME", targetUserId: "self", scoped: false }),
    true,
  );
  assert.equal(
    can(actor(["EMPLOYEE"]), { capability: "VIEW_TIME", targetUserId: "other", scoped: true }),
    false,
  );
  assert.equal(
    can(actor(["MANAGER"]), { capability: "VIEW_TIME", targetUserId: "other", scoped: true }),
    true,
  );
  assert.equal(
    can(actor(["MANAGER"]), { capability: "VIEW_TIME", targetUserId: "other", scoped: false }),
    false,
  );
  assert.equal(
    can(actor(["ADMINISTRATOR"]), {
      capability: "VIEW_TIME",
      targetUserId: "other",
      scoped: false,
    }),
    true,
  );
  assert.equal(
    can(actor(["AUDITOR"]), { capability: "VIEW_TIME", targetUserId: "other", scoped: true }),
    true,
  );
});

test("project membership administration requires administrator or verified manager scope", () => {
  for (const roles of [["EMPLOYEE"], ["AUDITOR"]] as const) {
    assert.equal(can(actor(roles), { capability: "MANAGE_PROJECT", scoped: false }), false);
    assert.equal(can(actor(roles), { capability: "MANAGE_PROJECT", scoped: true }), false);
  }
  assert.equal(can(actor(["MANAGER"]), { capability: "MANAGE_PROJECT", scoped: false }), false);
  assert.equal(can(actor(["MANAGER"]), { capability: "MANAGE_PROJECT", scoped: true }), true);
  assert.equal(
    can(actor(["ADMINISTRATOR"]), { capability: "MANAGE_PROJECT", scoped: false }),
    true,
  );
});

test("document access requires project scope and auditors stay read-only", () => {
  assert.equal(
    can(actor(["EMPLOYEE"]), { capability: "READ_PROJECT_DOCUMENT", scoped: true }),
    true,
  );
  assert.equal(
    can(actor(["EMPLOYEE"]), { capability: "WRITE_PROJECT_DOCUMENT", scoped: true }),
    true,
  );
  assert.equal(
    can(actor(["EMPLOYEE"]), { capability: "DELETE_PROJECT_DOCUMENT", scoped: false }),
    false,
  );
  assert.equal(
    can(actor(["MANAGER"]), { capability: "WRITE_PROJECT_DOCUMENT", scoped: true }),
    true,
  );
  assert.equal(
    can(actor(["ADMINISTRATOR"]), { capability: "WRITE_PROJECT_DOCUMENT", scoped: false }),
    true,
  );
  assert.equal(
    can(actor(["AUDITOR"]), { capability: "READ_PROJECT_DOCUMENT", scoped: true }),
    true,
  );
  assert.equal(
    can(actor(["AUDITOR"]), { capability: "WRITE_PROJECT_DOCUMENT", scoped: true }),
    false,
  );
  assert.equal(
    can(actor(["AUDITOR", "ADMINISTRATOR"]), {
      capability: "DELETE_PROJECT_DOCUMENT",
      scoped: true,
    }),
    false,
  );
});

test("management permissions and own-only correction are explicit and deny by default", () => {
  assert.equal(can(actor(["MANAGER"]), { capability: "MANAGE_PROJECT", scoped: true }), true);
  assert.equal(can(actor(["MANAGER"]), { capability: "MANAGE_PROJECT", scoped: false }), false);
  assert.equal(
    can(actor(["ADMINISTRATOR"]), { capability: "MANAGE_PROJECT", scoped: false }),
    true,
  );
  assert.equal(can(actor(["MANAGER"]), { capability: "MANAGE_CLIENTS_AND_CODES" }), false);
  assert.equal(can(actor(["ADMINISTRATOR"]), { capability: "MANAGE_CLIENTS_AND_CODES" }), true);
  assert.equal(can(actor(["AUDITOR"]), { capability: "MANAGE_PEOPLE_AND_ROLES" }), false);
  assert.equal(can(actor(["EMPLOYEE"]), { capability: "READ_PROJECT", scoped: true }), true);
  assert.equal(can(actor(["EMPLOYEE"]), { capability: "READ_PROJECT", scoped: false }), false);
  assert.equal(can(actor(["MANAGER"]), { capability: "READ_REPORTS", scoped: true }), true);
  assert.equal(can(actor(["MANAGER"]), { capability: "READ_REPORTS", scoped: false }), false);
  assert.equal(can(actor(["AUDITOR"]), { capability: "READ_REPORTS", scoped: false }), true);
  assert.equal(can(actor(["ADMINISTRATOR"]), { capability: "READ_AUDIT", scoped: false }), true);
  assert.equal(can(actor(["AUDITOR"]), { capability: "READ_AUDIT", scoped: false }), false);
  assert.equal(can(actor(["EMPLOYEE"]), { capability: "READ_AUDIT", scoped: true }), false);
  for (const roles of [["EMPLOYEE"], ["MANAGER"], ["ADMINISTRATOR"]] as const)
    assert.equal(
      can(actor(roles), { capability: "CORRECT_TIME", targetUserId: "self", scoped: false }),
      true,
    );
  assert.equal(
    can(actor(["MANAGER"]), { capability: "CORRECT_TIME", targetUserId: "other", scoped: true }),
    false,
  );
  assert.equal(
    can(actor(["ADMINISTRATOR"]), {
      capability: "CORRECT_TIME",
      targetUserId: "other",
      scoped: true,
    }),
    false,
  );
  assert.equal(
    can(actor(["AUDITOR"]), { capability: "CORRECT_TIME", targetUserId: "self", scoped: true }),
    false,
  );
  assert.throws(
    () => requireAllowed(actor(["EMPLOYEE"]), { capability: "MANAGE_PEOPLE_AND_ROLES" }),
    /forbidden/,
  );
});
