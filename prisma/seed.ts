import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient, PresenceState, ProjectRole, Role } from "../src/generated/prisma/client";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required to seed the database.");

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: databaseUrl }) });

async function main() {
  const user = await prisma.user.upsert({
    where: { username: "demo.admin" },
    update: {},
    create: {
      issuer: "https://local.ppts.invalid",
      subject: "demo-admin",
      username: "demo.admin",
      displayName: "Alex Morgan",
      email: "alex@example.invalid",
      roles: { create: [{ role: Role.EMPLOYEE }, { role: Role.ADMINISTRATOR }] },
      presence: { create: { state: PresenceState.WORKING, message: "Building a better PPTS" } },
    },
  });

  const client = await prisma.client.upsert({
    where: { name: "Northstar Studio" },
    update: {},
    create: { name: "Northstar Studio" },
  });
  const status = await prisma.projectStatus.upsert({
    where: { name: "Active" },
    update: {},
    create: { name: "Active", description: "Work is currently underway." },
  });
  const project = await prisma.project.upsert({
    where: { clientId_name: { clientId: client.id, name: "PPTS Modernization" } },
    update: {},
    create: {
      clientId: client.id,
      statusId: status.id,
      name: "PPTS Modernization",
      description: "Securely rebuilding the original people and project tracking system.",
      members: { create: { userId: user.id, role: ProjectRole.MANAGER } },
    },
  });
  const workCode = await prisma.workCode.upsert({
    where: { name: "Engineering" },
    update: {},
    create: { name: "Engineering", description: "Product engineering and implementation." },
  });

  await prisma.presence.update({ where: { userId: user.id }, data: { projectId: project.id } });
  const openEntry = await prisma.timeEntry.findFirst({ where: { userId: user.id, endedAt: null } });
  if (!openEntry) {
    await prisma.timeEntry.create({
      data: {
        userId: user.id,
        projectId: project.id,
        workCodeId: workCode.id,
        startedAt: new Date(Date.now() - 2 * 60 * 60 * 1000 - 18 * 60 * 1000),
        note: "Initial secure application foundation",
      },
    });
  }
}

main()
  .then(() => console.log("Seeded local development data."))
  .finally(() => prisma.$disconnect());
