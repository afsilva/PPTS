import "server-only";
import { cookies } from "next/headers";
import { getAuthConfig } from "./config";
import { seal, unseal } from "./crypto";

export interface LoginTransaction {
  state: string;
  nonce: string;
  verifier: string;
  returnTo: string;
  exp: number;
}
const name = "ppts_oidc_transaction";
export async function storeTransaction(value: LoginTransaction) {
  (await cookies()).set(name, await seal(value, "ppts-oidc-transaction"), {
    httpOnly: true,
    secure: getAuthConfig().secureCookies,
    sameSite: "lax",
    path: "/auth/callback",
    maxAge: 600,
  });
}
export async function consumeTransaction() {
  const jar = await cookies();
  const raw = jar.get(name)?.value;
  jar.delete(name);
  if (!raw) return null;
  try {
    const value = await unseal<LoginTransaction>(raw, "ppts-oidc-transaction");
    return value.exp > Date.now() / 1000 ? value : null;
  } catch {
    return null;
  }
}
export function safeReturnTo(value: string | null) {
  if (
    !value ||
    !value.startsWith("/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    /[\u0000-\u001f]/.test(value)
  )
    return "/";
  return value;
}
