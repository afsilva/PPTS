import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseUtcTimestamp,
  validCorrectionInterval,
} from "../../src/modules/time-tracking/corrections";
import { timeCorrectionSchema } from "../../src/modules/time-tracking/schemas";

const id = "00000000-0000-4000-8000-000000000001";

test("UTC timestamp parser preserves seconds and milliseconds", () => {
  assert.equal(
    parseUtcTimestamp("2026-11-08T02:15:42.731").toISOString(),
    "2026-11-08T02:15:42.731Z",
  );
  assert.equal(parseUtcTimestamp("2026-11-08T02:15:42").toISOString(), "2026-11-08T02:15:42.000Z");
  assert.throws(() => parseUtcTimestamp("2026-02-30T02:15:00"), /invalid_interval/);
  assert.throws(() => parseUtcTimestamp("2026-11-08 02:15:00"), /invalid_interval/);
});

test("correction interval must be positive, completed, and at most 31 days", () => {
  const now = new Date("2026-11-08T12:00:00Z");
  assert.equal(
    validCorrectionInterval(
      new Date("2026-11-08T09:00:00Z"),
      new Date("2026-11-08T10:00:00Z"),
      now,
    ),
    true,
  );
  assert.equal(
    validCorrectionInterval(
      new Date("2026-11-08T10:00:00Z"),
      new Date("2026-11-08T09:00:00Z"),
      now,
    ),
    false,
  );
  assert.equal(
    validCorrectionInterval(
      new Date("2026-11-08T11:00:00Z"),
      new Date("2026-11-08T13:00:00Z"),
      now,
    ),
    false,
  );
  assert.equal(
    validCorrectionInterval(
      new Date("2026-09-01T00:00:00Z"),
      new Date("2026-11-01T00:00:00Z"),
      now,
    ),
    false,
  );
});

test("correction schema bounds note and requires version", () => {
  const parsed = timeCorrectionSchema.parse({
    id,
    version: "2",
    startedAt: "2026-11-08T09:00:42.731",
    endedAt: "2026-11-08T10:00:03.112",
    note: " corrected ",
  });
  assert.equal(parsed.version, 2);
  assert.equal(parsed.note, "corrected");
  assert.throws(() =>
    timeCorrectionSchema.parse({ id, version: 0, startedAt: "a", endedAt: "b", note: "" }),
  );
  assert.throws(() =>
    timeCorrectionSchema.parse({
      id,
      version: 1,
      startedAt: "2026-11-08T09:00:00.000",
      endedAt: "2026-11-08T10:00:00.000",
      note: "x".repeat(1001),
    }),
  );
});
