import { test } from "node:test";
import assert from "node:assert/strict";
import { recognizeRoles, assertProvisionable, displayRole, PPTS_ROLES } from "../../src/auth/roles";

test("recognizes exactly the approved roles and de-duplicates", () => {
  assert.deepEqual(recognizeRoles(["EMPLOYEE", "ATTACKER", "EMPLOYEE", "ADMINISTRATOR"]), [
    "EMPLOYEE",
    "ADMINISTRATOR",
  ]);
});

test("rejects non-arrays and non-string entries", () => {
  assert.deepEqual(recognizeRoles(undefined), []);
  assert.deepEqual(recognizeRoles("EMPLOYEE"), []);
  assert.deepEqual(recognizeRoles([1, { role: "EMPLOYEE" }, null]), []);
});

test("all recognized roles map onto the schema enum values", () => {
  assert.deepEqual([...PPTS_ROLES].sort(), ["ADMINISTRATOR", "AUDITOR", "EMPLOYEE", "MANAGER"]);
});

test("provisioning fails closed when no approved role is present", () => {
  assert.throws(() => assertProvisionable([]), /no_authorized_role/);
  assert.doesNotThrow(() => assertProvisionable(["EMPLOYEE"]));
});

test("displayRole reports the most privileged role for display only", () => {
  assert.equal(displayRole(["EMPLOYEE", "ADMINISTRATOR"]), "ADMINISTRATOR");
  assert.equal(displayRole(["EMPLOYEE", "MANAGER"]), "MANAGER");
  assert.equal(displayRole(["EMPLOYEE"]), "EMPLOYEE");
  assert.equal(displayRole([]), "Member");
});
