#!/usr/bin/env node
import { readFile } from "node:fs/promises";
const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
const deprecated = Object.entries(lock.packages ?? {}).filter(([, record]) => record.deprecated);
if (deprecated.length) {
  for (const [path, record] of deprecated) console.error(`${path}: ${record.deprecated}`);
  process.exit(1);
}
console.log("Dependency metadata passed: no locked package is marked deprecated.");
