import { test } from "node:test";
import assert from "node:assert/strict";
import { safeReturnTo } from "../../src/auth/transaction";

test("accepts plain relative paths", () => {
  assert.equal(safeReturnTo("/"), "/");
  assert.equal(safeReturnTo("/reports?range=week"), "/reports?range=week");
});

test("rejects absent and non-relative values", () => {
  assert.equal(safeReturnTo(null), "/");
  assert.equal(safeReturnTo(""), "/");
  assert.equal(safeReturnTo("https://evil.example"), "/");
  assert.equal(safeReturnTo("https:/evil.example"), "/");
});

test("rejects scheme-relative, backslash, and control-character values", () => {
  assert.equal(safeReturnTo("//evil.example"), "/");
  assert.equal(safeReturnTo("/\\evil.example"), "/");
  assert.equal(safeReturnTo("/\u0000login"), "/");
  assert.equal(safeReturnTo("/\nlogin"), "/");
});
