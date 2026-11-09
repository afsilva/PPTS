import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_MAINTENANCE_INTERVAL_SECONDS,
  maintenanceIntervalSeconds,
  maintenanceRetryDelaySeconds,
} from "../../src/modules/maintenance/policy";

test("maintenance schedule defaults daily and accepts bounded integer seconds", () => {
  assert.equal(maintenanceIntervalSeconds(undefined), DEFAULT_MAINTENANCE_INTERVAL_SECONDS);
  assert.equal(maintenanceIntervalSeconds(""), DEFAULT_MAINTENANCE_INTERVAL_SECONDS);
  assert.equal(maintenanceIntervalSeconds("300"), 300);
  assert.equal(maintenanceIntervalSeconds("604800"), 604800);
});

test("maintenance schedule rejects unsafe or unreasonable intervals", () => {
  for (const value of ["0", "299", "604801", "1.5", " 300", "300 ", "daily", "-300"])
    assert.throws(() => maintenanceIntervalSeconds(value), /invalid_maintenance_interval/);
});

test("maintenance retries within five minutes without exceeding the schedule", () => {
  assert.equal(maintenanceRetryDelaySeconds(300), 300);
  assert.equal(maintenanceRetryDelaySeconds(3600), 300);
});
