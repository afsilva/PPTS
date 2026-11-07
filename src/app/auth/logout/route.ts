import { NextRequest, NextResponse } from "next/server";
import { auditAuth } from "@/auth/audit";
import { getAuthConfig } from "@/auth/config";
import { unseal } from "@/auth/crypto";
import { discovery } from "@/auth/oidc";
import { destroySession, readSession } from "@/auth/session";

export async function POST(request: NextRequest) {
  const config = getAuthConfig();
  if (request.headers.get("origin") !== config.APP_ORIGIN)
    return new NextResponse("Forbidden", { status: 403, headers: { "Cache-Control": "no-store" } });
  const current = await readSession();
  await destroySession();
  if (current)
    await auditAuth({
      action: "AUTH_LOGOUT",
      outcome: "SUCCESS",
      actorId: current.user.id,
      requestId: request.headers.get("x-request-id"),
    });
  // RP-initiated logout. If identity metadata is momentarily unavailable the
  // application session is already revoked; fall back to the login page.
  let destination = new URL("/login", config.APP_ORIGIN);
  try {
    const meta = await discovery();
    if (meta.end_session_endpoint) {
      destination = new URL(meta.end_session_endpoint);
      destination.searchParams.set("client_id", config.OIDC_CLIENT_ID);
      destination.searchParams.set("post_logout_redirect_uri", `${config.APP_ORIGIN}/login`);
      if (current) {
        const { idToken } = await unseal<{ idToken: string }>(
          current.idTokenCipher,
          "ppts-id-token",
        );
        destination.searchParams.set("id_token_hint", idToken);
      }
    }
  } catch {
    destination = new URL("/login", config.APP_ORIGIN);
  }
  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
