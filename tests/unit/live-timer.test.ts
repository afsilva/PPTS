import { test } from "node:test";
import assert from "node:assert/strict";
import {
  elapsedFromBaseline,
  formatClock,
  formatDuration,
} from "../../src/app/components/timer-format";

test("live timer catches up from an absolute baseline without interval drift", () => {
  assert.equal(elapsedFromBaseline(5, 1_000, 4_999), 8);
  assert.equal(elapsedFromBaseline(5, 5_000, 4_000), 5);
});

test("live timer formatting is deterministic and clamps negative values", () => {
  assert.equal(formatClock(-1), "00:00:00");
  assert.equal(formatClock(0), "00:00:00");
  assert.equal(formatClock(3661.9), "01:01:01");
  assert.equal(formatDuration(3661.9), "1h 01m");
});
