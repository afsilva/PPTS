import "server-only";
import { resolve } from "node:path";
import { z } from "zod";

const schema = z.object({
  DOCUMENT_STORAGE_ROOT: z.string().min(1).default("/var/lib/ppts-documents"),
  DOCUMENT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(10 * 1024 * 1024)
    .default(5 * 1024 * 1024),
  DOCUMENT_PROJECT_MAX_BYTES: z.coerce
    .number()
    .int()
    .min(1024)
    .max(1024 * 1024 * 1024)
    .default(100 * 1024 * 1024),
  DOCUMENT_PROJECT_MAX_COUNT: z.coerce.number().int().min(1).max(10000).default(500),
  DOCUMENT_RETENTION_DAYS: z.coerce.number().int().min(0).max(36500).default(0),
  CLAMAV_HOST: z.string().min(1).default("clamav"),
  CLAMAV_PORT: z.coerce.number().int().min(1).max(65535).default(3310),
  CLAMAV_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(30000),
});

export function getDocumentConfig() {
  const value = schema.parse({
    DOCUMENT_STORAGE_ROOT: process.env.DOCUMENT_STORAGE_ROOT,
    DOCUMENT_MAX_BYTES: process.env.DOCUMENT_MAX_BYTES,
    DOCUMENT_PROJECT_MAX_BYTES: process.env.DOCUMENT_PROJECT_MAX_BYTES,
    DOCUMENT_PROJECT_MAX_COUNT: process.env.DOCUMENT_PROJECT_MAX_COUNT,
    DOCUMENT_RETENTION_DAYS: process.env.DOCUMENT_RETENTION_DAYS,
    CLAMAV_HOST: process.env.CLAMAV_HOST,
    CLAMAV_PORT: process.env.CLAMAV_PORT,
    CLAMAV_TIMEOUT_MS: process.env.CLAMAV_TIMEOUT_MS,
  });
  const storageRoot = resolve(value.DOCUMENT_STORAGE_ROOT);
  if (storageRoot === "/" || storageRoot.length < 8)
    throw new Error("Unsafe document storage root.");
  return {
    ...value,
    storageRoot,
    quarantinePath: resolve(storageRoot, "quarantine"),
    cleanPath: resolve(storageRoot, "clean"),
  };
}
