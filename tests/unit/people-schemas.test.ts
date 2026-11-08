import { test } from "node:test";
import assert from "node:assert/strict";
import {
  personCreateSchema,
  personLinkSchema,
  personUnlinkSchema,
  personUpdateSchema,
} from "../../src/modules/people/schemas";

const valid = {
  submissionId: "00000000-0000-4000-8000-000000000099",
  kind: "EMPLOYEE",
  displayName: "  Alex Example  ",
  title: "Developer",
};

test("person create requires a UUID idempotency key", () => {
  assert.throws(() => personCreateSchema.parse({ ...valid, submissionId: "bad" }));
  assert.throws(() => personCreateSchema.parse({ ...valid, submissionId: undefined }));
});

test("person input is normalized and bounded", () => {
  const parsed = personCreateSchema.parse(valid);
  assert.equal(parsed.displayName, "Alex Example");
  assert.equal(parsed.address, "");
  assert.throws(() => personCreateSchema.parse({ ...valid, displayName: "x".repeat(161) }));
});

test("birthday requires a complete valid month/day pair", () => {
  assert.throws(() => personCreateSchema.parse({ ...valid, birthdayMonth: "2" }));
  assert.throws(() =>
    personCreateSchema.parse({ ...valid, birthdayMonth: "2", birthdayDay: "30" }),
  );
  const leap = personCreateSchema.parse({ ...valid, birthdayMonth: "2", birthdayDay: "29" });
  assert.equal(leap.birthdayDay, 29);
});

test("identity link and unlink require UUIDs and optimistic versions", () => {
  const id = "00000000-0000-4000-8000-000000000001";
  const userId = "00000000-0000-4000-8000-000000000002";
  assert.deepEqual(personLinkSchema.parse({ id, userId, version: "2" }), {
    id,
    userId,
    version: 2,
  });
  assert.deepEqual(personUnlinkSchema.parse({ id, version: "3" }), { id, version: 3 });
  assert.throws(() => personLinkSchema.parse({ id, userId: "bad", version: 1 }));
  assert.throws(() => personUnlinkSchema.parse({ id, version: 0 }));
});

test("person updates require UUID and positive optimistic version", () => {
  assert.throws(() =>
    personUpdateSchema.parse({ ...valid, submissionId: undefined, id: "bad", version: 1 }),
  );
  assert.throws(() =>
    personUpdateSchema.parse({
      ...valid,
      submissionId: undefined,
      id: "00000000-0000-4000-8000-000000000001",
      version: 0,
    }),
  );
  assert.equal(
    personUpdateSchema.parse({
      ...valid,
      submissionId: undefined,
      id: "00000000-0000-4000-8000-000000000001",
      version: "2",
    }).version,
    2,
  );
});
