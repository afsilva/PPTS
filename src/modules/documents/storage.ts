import "server-only";
import { createReadStream } from "node:fs";
import { constants } from "node:fs";
import { copyFile, mkdir, open, readFile, rm, stat } from "node:fs/promises";
import { dirname, join } from "node:path";
import { pipeline } from "node:stream/promises";
import { getDocumentConfig } from "@/config/documents";

export type StorageArea = "quarantine" | "clean";

function safeObjectKey(value: string) {
  if (!/^[0-9a-f]{32}$/.test(value)) throw new Error("invalid object key");
  return value;
}

function root(area: StorageArea) {
  const config = getDocumentConfig();
  return area === "quarantine" ? config.quarantinePath : config.cleanPath;
}

function objectPath(area: StorageArea, objectKey: string) {
  return join(root(area), safeObjectKey(objectKey));
}

export async function initializeDocumentStorage() {
  const config = getDocumentConfig();
  await Promise.all([
    mkdir(config.quarantinePath, { recursive: true, mode: 0o700 }),
    mkdir(config.cleanPath, { recursive: true, mode: 0o700 }),
  ]);
}

export async function writeDocumentObject(area: StorageArea, objectKey: string, bytes: Buffer) {
  await initializeDocumentStorage();
  const target = objectPath(area, objectKey);
  const handle = await open(target, "wx", 0o600);
  try {
    await handle.writeFile(bytes);
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function readDocumentObject(area: StorageArea, objectKey: string) {
  return readFile(objectPath(area, objectKey));
}

export async function promoteDocumentObject(objectKey: string) {
  await initializeDocumentStorage();
  const source = objectPath("quarantine", objectKey);
  const target = objectPath("clean", objectKey);
  // Never overwrite an existing clean object. Keep quarantine until database
  // availability commits so a crash after copy remains recoverable.
  await copyFile(source, target, constants.COPYFILE_EXCL);
}

export async function deleteDocumentObject(area: StorageArea, objectKey: string) {
  await rm(objectPath(area, objectKey), { force: true });
}

export async function documentObjectSize(area: StorageArea, objectKey: string) {
  return (await stat(objectPath(area, objectKey))).size;
}

export function streamDocumentObject(objectKey: string) {
  return createReadStream(objectPath("clean", objectKey));
}

export async function copyStreamToDocument(
  area: StorageArea,
  objectKey: string,
  source: NodeJS.ReadableStream,
) {
  await initializeDocumentStorage();
  const target = objectPath(area, objectKey);
  await mkdir(dirname(target), { recursive: true, mode: 0o700 });
  const handle = await open(target, "wx", 0o600);
  try {
    await pipeline(source, handle.createWriteStream());
  } finally {
    await handle.close();
  }
}
