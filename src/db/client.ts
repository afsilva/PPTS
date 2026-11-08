import "server-only";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";
import { getServerEnv } from "@/config/env";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createClient() {
  const { DATABASE_URL } = getServerEnv();
  if (!DATABASE_URL) throw new Error("DATABASE_URL is required for database operations.");
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
}

export function getDatabase() {
  const client = globalForPrisma.prisma ?? createClient();
  // One pool per application process. Creating a client per production request
  // leaks pools under readiness polling and can exhaust PostgreSQL connections.
  globalForPrisma.prisma = client;
  return client;
}
