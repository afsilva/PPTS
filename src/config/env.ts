import "server-only";
import { z } from "zod";

const schema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z.url().startsWith("postgresql://").optional(),
});

export function getOrganizationTimeZone() {
  const value = process.env.ORGANIZATION_TIME_ZONE ?? "UTC";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format();
    return value;
  } catch {
    throw new Error("ORGANIZATION_TIME_ZONE must be a valid IANA time-zone name.");
  }
}

export function getServerEnv() {
  return schema.parse({
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
  });
}
