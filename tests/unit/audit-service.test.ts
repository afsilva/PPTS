import { test } from "node:test";
import assert from "node:assert/strict";
import { parseAuditPage } from "../../src/modules/audit/service";

test("audit pagination accepts only bounded positive safe integers", () => {
  assert.equal(parseAuditPage(undefined), 1);
  assert.equal(parseAuditPage("2"), 2);
  for (const value of ["0", "-1", "1.5", "no", "1001", "9007199254740992"])
    assert.throws(() => parseAuditPage(value), /invalid_target/);
});
