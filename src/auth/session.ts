import "server-only";
import { cookies } from "next/headers";
import { getDatabase } from "@/db/client";
import { getAuthConfig } from "./config";
import { randomToken, seal, sha256, unseal } from "./crypto";

const SESSION_SECONDS = 8 * 60 * 60;
const IDLE_SECONDS = 60 * 60;
const TOUCH_SECONDS = 5 * 60;
interface SessionCookie {
  v: 1;
  sid: string;
  userId: string;
  exp: number;
}

function cookieName() {
  return getAuthConfig().secureCookies ? "__Host-ppts_session" : "ppts_session";
}
function options(maxAge = SESSION_SECONDS) {
  return {
    httpOnly: true,
    secure: getAuthConfig().secureCookies,
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

export async function createSession(userId: string, idToken: string) {
  const sid = randomToken();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000);
  await getDatabase().session.create({
    data: {
      idHash: sha256(sid),
      userId,
      expiresAt,
      idTokenHash: sha256(idToken),
      idTokenCipher: await seal({ idToken }, "ppts-id-token"),
    },
  });
  const value = await seal(
    { v: 1, sid, userId, exp: Math.floor(expiresAt.getTime() / 1000) } satisfies SessionCookie,
    "ppts-session",
  );
  (await cookies()).set(cookieName(), value, options());
}

export async function readSession() {
  const value = (await cookies()).get(cookieName())?.value;
  if (!value || value.length > 4096) return null;
  try {
    const data = await unseal<SessionCookie>(value, "ppts-session");
    if (
      data.v !== 1 ||
      typeof data.sid !== "string" ||
      typeof data.userId !== "string" ||
      data.exp <= Date.now() / 1000
    )
      return null;
    const record = await getDatabase().session.findUnique({
      where: { idHash: sha256(data.sid) },
      include: { user: { include: { roles: true } } },
    });
    const now = new Date();
    if (
      !record ||
      record.revokedAt ||
      record.expiresAt <= now ||
      record.lastSeenAt.getTime() + IDLE_SECONDS * 1000 <= now.getTime() ||
      !record.user.active ||
      record.userId !== data.userId
    )
      return null;
    if (record.lastSeenAt.getTime() + TOUCH_SECONDS * 1000 <= now.getTime())
      await getDatabase().session.updateMany({
        where: { idHash: record.idHash, revokedAt: null },
        data: { lastSeenAt: now },
      });
    return { sessionHash: record.idHash, idTokenCipher: record.idTokenCipher, user: record.user };
  } catch {
    return null;
  }
}

export async function destroySession() {
  const current = await readSession();
  if (current)
    await getDatabase().session.updateMany({
      where: { idHash: current.sessionHash },
      data: { revokedAt: new Date() },
    });
  (await cookies()).set(cookieName(), "", options(0));
  return current;
}
