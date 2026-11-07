#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import process from "node:process";

const minimumHours = Number(process.env.NPM_MIN_PACKAGE_AGE_HOURS ?? "72");
const now = new Date(process.env.POLICY_NOW ?? Date.now());
const registry = (process.env.NPM_CONFIG_REGISTRY ?? "https://registry.npmjs.org").replace(
  /\/$/,
  "",
);
const concurrency = 12;
const retries = 3;

if (!Number.isFinite(minimumHours) || minimumHours < 0)
  throw new Error("Invalid minimum package age.");
if (Number.isNaN(now.getTime())) throw new Error("Invalid POLICY_NOW timestamp.");

const lock = JSON.parse(await readFile(new URL("../package-lock.json", import.meta.url), "utf8"));
if (lock.lockfileVersion !== 3)
  throw new Error(`Unsupported lockfile version ${lock.lockfileVersion}; expected 3.`);

function packageName(path, record) {
  if (record.name) return record.name;
  const marker = "node_modules/";
  const index = path.lastIndexOf(marker);
  return index >= 0 ? path.slice(index + marker.length) : null;
}

const packages = [];
const forbidden = [];
for (const [path, record] of Object.entries(lock.packages ?? {})) {
  if (!path) continue;
  const name = packageName(path, record);
  const version = record.version;
  if (!name || !version) {
    forbidden.push(`${path}: missing registry package name or version`);
    continue;
  }
  if (
    record.resolved &&
    !record.resolved.startsWith(`${registry}/`) &&
    !record.resolved.startsWith("https://registry.npmjs.org/")
  ) {
    forbidden.push(`${name}@${version}: non-registry source ${record.resolved}`);
  }
  packages.push({ name, version, deprecated: record.deprecated });
}

const unique = [
  ...new Map(packages.map((item) => [`${item.name}@${item.version}`, item])).values(),
];

async function packument(item) {
  const encoded = item.name.startsWith("@")
    ? item.name.replace("/", "%2f")
    : encodeURIComponent(item.name);
  const url = `${registry}/${encoded}`;
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(15_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw new Error(`${item.name}: registry metadata unavailable (${lastError})`);
}

const failures = [...forbidden];
let cursor = 0;
async function worker() {
  while (cursor < unique.length) {
    const item = unique[cursor++];
    try {
      if (item.deprecated)
        failures.push(`${item.name}@${item.version}: deprecated — ${item.deprecated}`);
      const metadata = await packument(item);
      const publishedValue = metadata.time?.[item.version];
      if (!publishedValue) {
        failures.push(`${item.name}@${item.version}: missing publication timestamp`);
        continue;
      }
      const published = new Date(publishedValue);
      const ageHours = (now.getTime() - published.getTime()) / 3_600_000;
      if (!Number.isFinite(ageHours))
        failures.push(
          `${item.name}@${item.version}: malformed publication timestamp ${publishedValue}`,
        );
      else if (ageHours < minimumHours)
        failures.push(
          `${item.name}@${item.version}: ${ageHours.toFixed(1)}h old (published ${published.toISOString()}; minimum ${minimumHours}h)`,
        );
    } catch (error) {
      failures.push(String(error instanceof Error ? error.message : error));
    }
  }
}

await Promise.all(Array.from({ length: Math.min(concurrency, unique.length) }, () => worker()));

if (failures.length) {
  console.error(`Supply-chain policy failed for ${failures.length} item(s):`);
  for (const failure of failures.sort()) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Supply-chain policy passed: ${unique.length} locked package versions are not deprecated, have no non-registry sources, and are at least ${minimumHours} hours old as of ${now.toISOString()}.`,
);
