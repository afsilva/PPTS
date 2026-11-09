import { test } from "node:test";
import assert from "node:assert/strict";
import { projectLogSchema, projectUpdateSchema } from "../../src/modules/projects/schemas";

const id = "00000000-0000-4000-8000-000000000001";
const valid = {
  id,
  version: "1",
  clientId: id,
  statusId: id,
  name: "PPTS",
  description: "",
  billingRate: "125.50",
};

test("project update converts money and preserves explicit relationship clearing", () => {
  const parsed = projectUpdateSchema.parse({
    ...valid,
    coderId: "",
    developmentContactId: "",
    productionContactId: "",
    estimatedCodingMinutes: "",
  });
  assert.equal(parsed.billingRate, 12550);
  assert.equal(parsed.coderId, null);
  assert.equal(parsed.developmentContactId, null);
  assert.equal(parsed.productionContactId, null);
  assert.equal(parsed.estimatedCodingMinutes, undefined);
});

test("project update rejects negative estimates, invalid money, and oversized fields", () => {
  assert.throws(() => projectUpdateSchema.parse({ ...valid, estimatedTestingMinutes: "-1" }));
  assert.throws(() => projectUpdateSchema.parse({ ...valid, billingRate: "1.999" }));
  assert.throws(() => projectUpdateSchema.parse({ ...valid, extras: "x".repeat(1001) }));
});

test("project journal requires bounded nonblank plain text", () => {
  assert.throws(() => projectLogSchema.parse({ projectId: id, body: "   " }));
  assert.equal(projectLogSchema.parse({ projectId: id, body: " update " }).body, "update");
  assert.throws(() => projectLogSchema.parse({ projectId: id, body: "x".repeat(5001) }));
});
