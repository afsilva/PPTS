import "server-only";
import { redirect } from "next/navigation";
import { readSession } from "@/auth/session";
import type { Actor } from "./policy";

export async function readActor(): Promise<Actor | null> {
  const session = await readSession();
  if (!session) return null;
  return {
    userId: session.user.id,
    roles: session.user.roles.map(({ role }) => role),
  };
}

export async function requireActor(): Promise<Actor> {
  const actor = await readActor();
  if (!actor) redirect("/login");
  return actor;
}
