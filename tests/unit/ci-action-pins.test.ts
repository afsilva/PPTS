import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  actionReferences,
  checkWorkflowDirectory,
  validateActionReference,
} from "../../scripts/check-ci-action-pins.mjs";

const sha = "0123456789abcdef0123456789abcdef01234567";
const digest = "a".repeat(64);

test("CI action policy accepts full commit SHAs, local actions, and image digests", () => {
  assert.equal(validateActionReference(`actions/checkout@${sha}`), null);
  assert.equal(validateActionReference(`owner/repository/subpath@${sha}`), null);
  assert.equal(validateActionReference("./.github/actions/local"), null);
  assert.equal(validateActionReference(`docker://alpine@sha256:${digest}`), null);
});

test("CI action policy rejects mutable and malformed references", () => {
  for (const reference of [
    "actions/checkout@v4",
    "actions/checkout@main",
    "actions/checkout@0123456",
    `actions/checkout@${sha.toUpperCase()}`,
    "docker://alpine:latest",
    "docker://alpine@sha256:short",
    "checkout",
  ])
    assert.ok(validateActionReference(reference));
});

test("workflow scanner finds quoted action references without treating comments as pins", () => {
  assert.deepEqual(
    actionReferences(
      `steps:\n  - uses: "actions/checkout@${sha}" # v4\n  - uses: ./.github/actions/local\n`,
    ),
    [
      { line: 2, reference: `actions/checkout@${sha}` },
      { line: 3, reference: "./.github/actions/local" },
    ],
  );
});

test("workflow directory check reports every mutable reference", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "ppts-actions-"));
  try {
    await writeFile(
      path.join(directory, "ci.yml"),
      `steps:\n  - uses: actions/checkout@v4\n  - uses: actions/setup-node@${sha}\n`,
    );
    const result = await checkWorkflowDirectory(directory);
    assert.equal(result.checked, 2);
    assert.equal(result.failures.length, 1);
    assert.match(result.failures[0], /ci\.yml:2: action is not pinned/);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});
