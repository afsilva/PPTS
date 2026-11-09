#!/usr/bin/env node
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const COMMIT_SHA = /^[0-9a-f]{40}$/;
const DOCKER_DIGEST = /^docker:\/\/[^\s@]+@sha256:[0-9a-f]{64}$/;

export function validateActionReference(reference) {
  if (reference.startsWith("./")) return null;
  if (reference.startsWith("docker://"))
    return DOCKER_DIGEST.test(reference) ? null : "container action is not digest-pinned";

  const separator = reference.lastIndexOf("@");
  if (separator <= 0 || !COMMIT_SHA.test(reference.slice(separator + 1)))
    return "action is not pinned to a full lowercase commit SHA";
  if (!/^[^\s/@]+\/[^\s@]+(?:\/[^\s@]+)*$/.test(reference.slice(0, separator)))
    return "action repository reference is malformed";
  return null;
}

export function actionReferences(yaml) {
  const references = [];
  for (const [index, line] of yaml.split(/\r?\n/).entries()) {
    if (!/^\s*(?:-\s+)?uses\s*:/.test(line)) continue;
    const match = line.match(/^\s*(?:-\s+)?uses\s*:\s*([^#]*?)(?:\s+#.*)?$/);
    if (!match) {
      references.push({ line: index + 1, reference: "", error: "unparseable uses entry" });
      continue;
    }
    let reference = match[1].trim();
    if (
      reference.length >= 2 &&
      ((reference.startsWith('"') && reference.endsWith('"')) ||
        (reference.startsWith("'") && reference.endsWith("'")))
    )
      reference = reference.slice(1, -1);
    references.push({ line: index + 1, reference });
  }
  return references;
}

export async function checkWorkflowDirectory(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const failures = [];
  let checked = 0;
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    if (!entry.isFile() || !/\.ya?ml$/.test(entry.name)) continue;
    const file = path.join(directory, entry.name);
    const yaml = await readFile(file, "utf8");
    for (const item of actionReferences(yaml)) {
      checked += 1;
      const reason = item.error ?? validateActionReference(item.reference);
      if (reason) failures.push(`${file}:${item.line}: ${reason}: ${item.reference || "<empty>"}`);
    }
  }
  if (checked === 0) failures.push(`${directory}: no action references found`);
  return { checked, failures };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (invokedPath === fileURLToPath(import.meta.url)) {
  const directory = path.resolve(process.argv[2] ?? ".github/workflows");
  const { checked, failures } = await checkWorkflowDirectory(directory);
  if (failures.length) {
    console.error(`CI action pin policy failed for ${failures.length} item(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log(`CI action pin policy passed: ${checked} action references are immutable.`);
}
