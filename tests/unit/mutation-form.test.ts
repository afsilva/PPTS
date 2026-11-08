import { test } from "node:test";
import assert from "node:assert/strict";
import { BusinessError } from "../../src/modules/business/errors";
import { readBoundedForm } from "../../src/modules/mutations/form";

const request = (body: BodyInit | null = null) =>
  new Request("http://localhost:3000/api/time/clock-in", {
    method: "POST",
    body,
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
  });

test("bounded form reads ordinary URL-encoded values", async () => {
  assert.deepEqual(await readBoundedForm(request("projectId=one&message=Ready+now")), {
    projectId: "one",
    message: "Ready now",
  });
});

test("bounded form rejects streamed bodies beyond 4 KiB", async () => {
  const oversized = request(`message=${"x".repeat(4097)}`);
  await assert.rejects(
    () => readBoundedForm(oversized),
    (error: unknown) => error instanceof BusinessError && error.code === "PAYLOAD_TOO_LARGE",
  );
});
