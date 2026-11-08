import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the database.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const client = await prisma.client.upsert({
    where: { name: "Northstar Studio" },
    update: { archivedAt: null },
    create: { name: "Northstar Studio" },
  });
  const status = await prisma.projectStatus.upsert({
    where: { name: "Active" },
    update: { description: "Work is currently underway." },
    create: { name: "Active", description: "Work is currently underway." },
  });
  await prisma.project.upsert({
    where: { clientId_name: { clientId: client.id, name: "PPTS Modernization" } },
    update: {
      statusId: status.id,
      description: "Securely rebuilding the original people and project tracking system.",
      archivedAt: null,
    },
    create: {
      clientId: client.id,
      statusId: status.id,
      name: "PPTS Modernization",
      description: "Securely rebuilding the original people and project tracking system.",
    },
  });
  for (const code of [
    ["Engineering", "Product engineering and implementation."],
    ["Planning", "Project planning and coordination."],
    ["Testing", "Verification, accessibility, and security testing."],
  ] as const)
    await prisma.workCode.upsert({
      where: { name: code[0] },
      update: { description: code[1], active: true },
      create: { name: code[0], description: code[1], active: true },
    });
}

main()
  .then(() => console.log("Seeded synthetic local business catalog."))
  .finally(() => prisma.$disconnect());
