import { NextRequest, NextResponse } from "next/server";
import { getAuthConfig } from "@/auth/config";
import { pkceChallenge, randomToken } from "@/auth/crypto";
import { discovery } from "@/auth/oidc";
import { safeReturnTo, storeTransaction } from "@/auth/transaction";

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const meta = await discovery();
  const state = randomToken();
  const nonce = randomToken();
  const verifier = randomToken(48);
  await storeTransaction({
    state,
    nonce,
    verifier,
    returnTo: safeReturnTo(request.nextUrl.searchParams.get("returnTo")),
    exp: Math.floor(Date.now() / 1000) + 600,
  });
  const url = new URL(meta.authorization_endpoint);
  for (const [key, value] of Object.entries({
    client_id: config.OIDC_CLIENT_ID,
    redirect_uri: `${config.APP_ORIGIN}/auth/callback`,
    response_type: "code",
    scope: "openid profile email",
    state,
    nonce,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  }))
    url.searchParams.set(key, value);
  return NextResponse.redirect(url, { headers: { "Cache-Control": "no-store" } });
}
