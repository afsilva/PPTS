import { NextResponse } from "next/server";
import { getAuthConfig } from "@/auth/config";
import { consumeLogoutTransaction } from "@/auth/logout-transaction";

export async function GET() {
  const config = getAuthConfig();
  const destination = (await consumeLogoutTransaction()) ?? `${config.APP_ORIGIN}/login`;
  return NextResponse.redirect(destination, {
    status: 303,
    headers: { "Cache-Control": "no-store" },
  });
}
