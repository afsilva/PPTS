import { NextRequest, NextResponse } from "next/server";
import { auditAuth } from "@/auth/audit";
import { getAuthConfig } from "@/auth/config";
import { safeEqual } from "@/auth/crypto";
import { exchangeCode, verifyIdToken } from "@/auth/oidc";
import { assertProvisionable, recognizeRoles } from "@/auth/roles";
import { createSession } from "@/auth/session";
import { consumeTransaction } from "@/auth/transaction";
import { getDatabase } from "@/db/client";

function failure(config: ReturnType<typeof getAuthConfig>, error: string) {
  return NextResponse.redirect(new URL(`/login?error=${error}`, config.APP_ORIGIN), {
    headers: { "Cache-Control": "no-store" },
  });
}

export async function GET(request: NextRequest) {
  const config = getAuthConfig();
  const requestId = request.headers.get("x-request-id");
  const transaction = await consumeTransaction();
  const code = request.nextUrl.searchParams.get("code");
  const state = request.nextUrl.searchParams.get("state");
  if (!transaction || !code || !state || !safeEqual(state, transaction.state)) {
    await auditAuth({
      action: "AUTH_LOGIN_FAILED",
      outcome: "FAILURE",
      requestId,
      reason: "invalid_callback",
    });
    return failure(config, "invalid_callback");
  }
  let issuer: string | undefined;
  let subject: string | undefined;
  try {
    const tokens = await exchangeCode(code, transaction.verifier);
    const claims = await verifyIdToken(tokens.id_token, transaction.nonce);
    issuer = config.OIDC_ISSUER;
    subject = claims.sub;
    const username =
      typeof claims.preferred_username === "string" ? claims.preferred_username : claims.sub;
    const displayName = typeof claims.name === "string" ? claims.name : username;
    const email =
      typeof claims.email === "string" && claims.email_verified === true
        ? claims.email
        : `${claims.sub}@local.invalid`;
    const roles = recognizeRoles(claims.realm_access?.roles);
    assertProvisionable(roles);

    const user = await getDatabase().$transaction(async (db) => {
      const result = await db.user.upsert({
        where: { issuer_subject: { issuer: config.OIDC_ISSUER, subject: claims.sub } },
        update: { username, displayName, email },
        create: {
          issuer: config.OIDC_ISSUER,
          subject: claims.sub,
          username,
          displayName,
          email,
          presence: { create: {} },
        },
      });
      if (!result.active) throw new Error("inactive_account");
      // Keep replacement ordering explicit. A nested deleteMany + create on
      // the same composite keys may be reordered by Prisma and fail P2002 on
      // repeat login before the stale role rows are removed.
      await db.userRole.deleteMany({ where: { userId: result.id } });
      await db.userRole.createMany({
        data: roles.map((role) => ({ userId: result.id, role })),
      });
      return result;
    });
    await createSession(user.id, tokens.id_token);
    await auditAuth({
      action: "AUTH_LOGIN",
      outcome: "SUCCESS",
      actorId: user.id,
      issuer,
      subject,
      requestId,
    });
    return NextResponse.redirect(new URL(transaction.returnTo, config.APP_ORIGIN), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error(
      "[auth] callback failed",
      error instanceof Error ? error.name : "unknown",
      typeof error === "object" && error !== null && "code" in error
        ? String(error.code).slice(0, 20)
        : "",
    );
    const reason =
      error instanceof Error && /^[a-z_]+$/.test(error.message)
        ? error.message
        : "authentication_failed";
    await auditAuth({
      action: "AUTH_LOGIN_FAILED",
      outcome: "FAILURE",
      issuer,
      subject,
      requestId,
      reason,
    });
    return failure(config, "authentication_failed");
  }
}
