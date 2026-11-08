import { NextRequest, NextResponse } from "next/server";

function contentSecurityPolicy(nonce: string) {
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "object-src 'none'",
    "img-src 'self' data:",
    "font-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    "connect-src 'self'",
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // Next emits small inline bootstrap scripts for App Router hydration. A
  // per-request nonce allows only those scripts while keeping unsafe-inline
  // out of script-src. Without this, the browser displays server HTML but
  // never hydrates client forms or the live timer.
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const csp = contentSecurityPolicy(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);

  const pathname = request.nextUrl.pathname;
  const publicAuthPath = pathname === "/login" || pathname.startsWith("/auth/");
  if (
    !publicAuthPath &&
    !request.cookies.has("ppts_session") &&
    !request.cookies.has("__Host-ppts_session")
  ) {
    const login = new URL("/login", request.url);
    login.searchParams.set("returnTo", `${pathname}${request.nextUrl.search}`);
    const response = NextResponse.redirect(login);
    response.headers.set("Content-Security-Policy", csp);
    return response;
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}

export const config = {
  // API handlers remain their own authorization boundary and static assets do
  // not need a per-request nonce. All rendered documents, including login and
  // logout completion, pass through the nonce boundary.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico).*)"],
};
