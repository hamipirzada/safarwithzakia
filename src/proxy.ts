import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Convenience redirect only: sends visitors without a session cookie to the login page.
 * It does NOT authorise anything — every admin page, server action and API handler checks the
 * session and role on the server (src/server/authz.ts).
 */
const PUBLIC_ADMIN_PATHS = ["/admin/login", "/admin/forgot-password", "/admin/reset-password"];

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (PUBLIC_ADMIN_PATHS.some((p) => pathname === p)) return NextResponse.next();
  if (!getSessionCookie(request, { cookiePrefix: "swz" })) {
    const url = new URL("/admin/login", request.url);
    url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/admin/:path*"] };
