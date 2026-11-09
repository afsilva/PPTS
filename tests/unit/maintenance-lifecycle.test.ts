import { test } from "node:test";
import assert from "node:assert/strict";
import { waitForMaintenanceDelay } from "../../src/modules/maintenance/lifecycle";

test("maintenance delay remains pending until its referenced timer completes", async () => {
  const controller = new AbortController();
  let settled = false;
  const waiting = waitForMaintenanceDelay(40, controller.signal).then(() => {
    settled = true;
  });

  await new Promise((resolve) => setTimeout(resolve, 5));
  assert.equal(settled, false);
  await waiting;
  assert.equal(settled, true);
});

test("maintenance delay stops promptly when shutdown is requested", async () => {
  const controller = new AbortController();
  const started = Date.now();
  const waiting = waitForMaintenanceDelay(10_000, controller.signal);

  controller.abort();
  await waiting;
  assert.ok(Date.now() - started < 1_000);
});

test("maintenance delay resolves immediately after an earlier shutdown", async () => {
  const controller = new AbortController();
  controller.abort();
  await waitForMaintenanceDelay(10_000, controller.signal);
});

test("maintenance delay rejects invalid durations", () => {
  const signal = new AbortController().signal;
  for (const value of [-1, Number.NaN, Number.POSITIVE_INFINITY])
    assert.throws(() => waitForMaintenanceDelay(value, signal), /invalid_maintenance_delay/);
});
