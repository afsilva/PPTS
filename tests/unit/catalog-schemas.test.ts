import { test } from "node:test";
import assert from "node:assert/strict";
import {
  clientUpdateSchema,
  statusUpdateSchema,
  workCodeStateSchema,
} from "../../src/modules/catalog/schemas";
const id = "00000000-0000-4000-8000-000000000001";
test("catalog updates require bounded names and optimistic version", () => {
  assert.equal(clientUpdateSchema.parse({ id, version: "2", name: " Client " }).name, "Client");
  assert.throws(() => clientUpdateSchema.parse({ id, version: 0, name: "Client" }));
  assert.throws(() => clientUpdateSchema.parse({ id, version: 1, name: "x".repeat(121) }));
});
test("status descriptions and work-code state are validated", () => {
  assert.equal(
    statusUpdateSchema.parse({ id, version: 1, name: "Active", description: " Work " }).description,
    "Work",
  );
  assert.throws(() =>
    statusUpdateSchema.parse({ id, version: 1, name: "Active", description: "x".repeat(2001) }),
  );
  assert.equal(workCodeStateSchema.parse({ id, version: "3", active: "false" }).version, 3);
  assert.throws(() => workCodeStateSchema.parse({ id, version: 1, active: "yes" }));
});
