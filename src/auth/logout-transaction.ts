import "server-only";
import { cookies } from "next/headers";
import { getAuthConfig } from "./config";
import { seal, unseal } from "./crypto";

interface LogoutTransaction {
  destination: string;
  exp: number;
}
const name = "ppts_logout_transaction";

export async function storeLogoutTransaction(destination: string) {
  const value: LogoutTransaction = { destination, exp: Math.floor(Date.now() / 1000) + 120 };
  (await cookies()).set(name, await seal(value, "ppts-logout-transaction"), {
    httpOnly: true,
    secure: getAuthConfig().secureCookies,
    sameSite: "lax",
    path: "/auth/logout/provider",
    maxAge: 120,
  });
}

export async function consumeLogoutTransaction() {
  const jar = await cookies();
  const raw = jar.get(name)?.value;
  jar.delete(name);
  if (!raw || raw.length > 4096) return null;
  try {
    const value = await unseal<LogoutTransaction>(raw, "ppts-logout-transaction");
    if (value.exp <= Date.now() / 1000) return null;
    const destination = new URL(value.destination);
    return destination.protocol === "http:" || destination.protocol === "https:"
      ? destination.href
      : null;
  } catch {
    return null;
  }
}
