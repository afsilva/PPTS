import { readFile, readdir } from "node:fs/promises";
import { resolve, relative, sep } from "node:path";

const root = process.cwd();
const contractPath = resolve(root, "tests/regression-contract.json");
const contract = JSON.parse(await readFile(contractPath, "utf8"));
const failures = [];
const ids = new Set();

async function filesNamed(directory, name) {
  const found = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, entry.name);
    if (entry.isDirectory()) found.push(...(await filesNamed(path, name)));
    else if (entry.name === name) found.push(relative(root, path).split(sep).join("/"));
  }
  return found.sort();
}

function validRepositoryPath(path) {
  return (
    typeof path === "string" && path.length > 0 && !path.startsWith("/") && !path.includes("..")
  );
}

async function readRepositoryFile(path, context) {
  if (!validRepositoryPath(path)) {
    failures.push(`${context}: invalid repository-relative path`);
    return null;
  }
  try {
    return await readFile(resolve(root, path), "utf8");
  } catch {
    failures.push(`${context}: missing file ${path}`);
    return null;
  }
}

async function checkEvidence(entry, section) {
  if (typeof entry.id !== "string" || !entry.id) failures.push(`${section}: entry has no id`);
  else if (ids.has(entry.id)) failures.push(`${section}: duplicate id ${entry.id}`);
  else ids.add(entry.id);

  const implementation = await readRepositoryFile(
    entry.implementation,
    `${section} ${entry.id ?? "unknown"}`,
  );
  if (implementation && entry.export) {
    const exportPattern = new RegExp(`export\\s+(?:async\\s+)?function\\s+${entry.export}\\b`);
    if (!exportPattern.test(implementation))
      failures.push(`${entry.id}: export ${entry.export} not found in ${entry.implementation}`);
  }

  if (!Array.isArray(entry.evidence) || entry.evidence.length === 0) {
    failures.push(`${entry.id}: at least one regression-test evidence item is required`);
    return;
  }
  for (const evidence of entry.evidence) {
    const contents = await readRepositoryFile(evidence.file, `${entry.id} evidence`);
    if (
      contents !== null &&
      (typeof evidence.contains !== "string" || !contents.includes(evidence.contains))
    )
      failures.push(`${entry.id}: evidence text not found in ${evidence.file}`);
  }
}

if (contract.schemaVersion !== 1) failures.push("Unsupported regression contract schemaVersion");
if (!Array.isArray(contract.routes)) failures.push("routes must be an array");
if (!Array.isArray(contract.businessActions)) failures.push("businessActions must be an array");

const routeFiles = await filesNamed(resolve(root, "src/app"), "route.ts");
const registeredRoutes = new Set((contract.routes ?? []).map((entry) => entry.implementation));
for (const route of routeFiles)
  if (!registeredRoutes.has(route)) failures.push(`Unregistered route action: ${route}`);
for (const registered of registeredRoutes)
  if (!routeFiles.includes(registered))
    failures.push(`Registered route is not a route.ts file: ${registered}`);

for (const entry of contract.routes ?? []) await checkEvidence(entry, "route");
for (const entry of contract.businessActions ?? []) await checkEvidence(entry, "businessAction");

const registeredBusinessActions = new Set(
  (contract.businessActions ?? []).map((entry) => `${entry.implementation}#${entry.export}`),
);
for (const directory of ["src/modules/projects", "src/modules/time-tracking"]) {
  for (const entry of await readdir(resolve(root, directory), { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".ts") || entry.name === "schemas.ts") continue;
    const implementation = `${directory}/${entry.name}`;
    const contents = await readFile(resolve(root, implementation), "utf8");
    const exports = contents.matchAll(/export\s+async\s+function\s+(\w+)\s*\(/g);
    for (const match of exports) {
      const action = `${implementation}#${match[1]}`;
      if (!registeredBusinessActions.has(action))
        failures.push(`Unregistered exported business action: ${action}`);
    }
  }
}

if (failures.length) {
  console.error("Regression contract failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  `Regression contract passed: ${contract.routes.length} route actions and ${contract.businessActions.length} business actions have durable test evidence.`,
);
