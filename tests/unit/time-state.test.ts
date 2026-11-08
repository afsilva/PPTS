import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cleanMessage,
  durationSeconds,
  durationSince,
  transitionClock,
  type ClockState,
} from "../../src/modules/time-tracking/domain";

const off: ClockState = { presence: "OFF_DUTY", openEntry: null };
const working: ClockState = {
  presence: "WORKING",
  openEntry: { projectId: "project-a", workCodeId: "engineering" },
};

test("clock in creates working state and rejects a second open entry", () => {
  assert.deepEqual(
    transitionClock(off, { type: "CLOCK_IN", projectId: "project-a", workCodeId: "engineering" }),
    { next: working, effect: "OPEN" },
  );
  assert.throws(
    () =>
      transitionClock(working, {
        type: "CLOCK_IN",
        projectId: "project-b",
        workCodeId: "planning",
      }),
    /already_clocked_in/,
  );
});

test("clock out closes work and a second stop is rejected", () => {
  assert.deepEqual(transitionClock(working, { type: "CLOCK_OUT" }), {
    next: off,
    effect: "CLOSE",
  });
  assert.throws(() => transitionClock(off, { type: "CLOCK_OUT" }), /not_clocked_in/);
});

test("switch changes project or work code atomically and rejects no-op", () => {
  assert.deepEqual(
    transitionClock(working, {
      type: "SWITCH",
      projectId: "project-b",
      workCodeId: "planning",
    }),
    {
      next: {
        presence: "WORKING",
        openEntry: { projectId: "project-b", workCodeId: "planning" },
      },
      effect: "SWITCH",
    },
  );
  assert.throws(
    () =>
      transitionClock(working, {
        type: "SWITCH",
        projectId: "project-a",
        workCodeId: "engineering",
      }),
    /no_change/,
  );
});

test("available is a non-working modern state", () => {
  assert.deepEqual(transitionClock(off, { type: "SET_AVAILABLE" }), {
    next: { presence: "AVAILABLE", openEntry: null },
    effect: "NONE",
  });
  assert.throws(() => transitionClock(working, { type: "SET_AVAILABLE" }), /already_clocked_in/);
});

test("messages are bounded and stripped of controls", () => {
  assert.equal(cleanMessage("  design\n review\u0000  "), "design review");
  assert.equal(cleanMessage("x".repeat(500)).length, 280);
  assert.equal(cleanMessage(null), "");
});

test("duration is server-derived, clipped to reporting boundaries, and never negative", () => {
  const start = new Date("2026-11-07T10:00:00Z");
  assert.equal(durationSeconds(start, new Date("2026-11-07T12:18:30Z")), 8310);
  assert.equal(durationSeconds(start, new Date("2026-11-07T09:00:00Z")), 0);
  assert.equal(
    durationSince(
      new Date("2026-11-06T23:00:00Z"),
      new Date("2026-11-07T01:00:00Z"),
      new Date("2026-11-07T00:00:00Z"),
    ),
    3600,
  );
});
