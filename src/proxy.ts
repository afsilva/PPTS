import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  if (request.cookies.has("ppts_session") || request.cookies.has("__Host-ppts_session"))
    return NextResponse.next();
  const login = new URL("/login", request.url);
  login.searchParams.set("returnTo", `${request.nextUrl.pathname}${request.nextUrl.search}`);
  return NextResponse.redirect(login);
}

export const config = {
  // API routes return their own machine-readable 401/403 responses. This proxy
  // is only an optimistic browser-page redirect, never an authorization boundary.
  matcher: ["/((?!login|auth|api/|_next/static|_next/image|favicon.ico).*)"],
};
