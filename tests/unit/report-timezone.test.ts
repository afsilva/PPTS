import { test } from "node:test";
import assert from "node:assert/strict";
import { zonedMonthBounds, zonedYearMonth } from "../../src/modules/reports/timezone";

test("UTC month boundaries and December rollover are exact", () => {
  assert.deepEqual(zonedMonthBounds(2026, 2, "UTC"), {
    start: new Date("2026-02-01T00:00:00.000Z"),
    end: new Date("2026-03-01T00:00:00.000Z"),
  });
  assert.deepEqual(zonedMonthBounds(2026, 12, "UTC"), {
    start: new Date("2026-12-01T00:00:00.000Z"),
    end: new Date("2027-01-01T00:00:00.000Z"),
  });
});

test("New York boundaries account for winter, summer, and DST transition offsets", () => {
  assert.deepEqual(zonedMonthBounds(2026, 1, "America/New_York"), {
    start: new Date("2026-01-01T05:00:00.000Z"),
    end: new Date("2026-02-01T05:00:00.000Z"),
  });
  assert.deepEqual(zonedMonthBounds(2026, 7, "America/New_York"), {
    start: new Date("2026-07-01T04:00:00.000Z"),
    end: new Date("2026-08-01T04:00:00.000Z"),
  });
  const march = zonedMonthBounds(2026, 3, "America/New_York");
  assert.equal(march.start.toISOString(), "2026-03-01T05:00:00.000Z");
  assert.equal(march.end.toISOString(), "2026-04-01T04:00:00.000Z");
  assert.equal((march.end.getTime() - march.start.getTime()) / 3_600_000, 743);
});

test("current reporting month is derived in the organization zone", () => {
  assert.deepEqual(zonedYearMonth(new Date("2026-01-01T02:00:00Z"), "America/New_York"), {
    year: 2025,
    month: 12,
  });
});

test("invalid zones and reporting months fail closed", () => {
  assert.throws(() => zonedMonthBounds(2026, 0, "UTC"), /Invalid reporting month/);
  assert.throws(() => zonedMonthBounds(2026, 13, "UTC"), /Invalid reporting month/);
  assert.throws(() => zonedMonthBounds(2026, 1, "Not\/A_Zone"));
});
