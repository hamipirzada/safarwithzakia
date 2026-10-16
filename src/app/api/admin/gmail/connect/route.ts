import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AuthorizationError, requireStaff } from "@/server/authz";
import { buildAuthorizeUrl } from "@/server/email/gmail";
import { getEnv } from "@/server/env";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "swz_gmail_oauth_state";

/** Starts the Google OAuth consent flow for the business mailbox. Administrators only. */
export async function GET(request: Request) {
  try {
    await requireStaff("ADMIN");
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.redirect(new URL("/admin/login", request.url));
    throw error;
  }
  const env = getEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET || !env.GMAIL_REDIRECT_URI) {
    return NextResponse.redirect(new URL("/admin/email-settings?error=not_configured", env.APP_URL));
  }
  const state = randomBytes(24).toString("base64url");
  (await cookies()).set(STATE_COOKIE, state, {
    httpOnly: true,
    sameSite: "lax", // must survive the top-level redirect back from Google
    secure: env.APP_URL.startsWith("https://"),
    path: "/api/admin/gmail",
    maxAge: 600,
  });
  const loginHint = new URL(request.url).searchParams.get("hint") ?? undefined;
  return NextResponse.redirect(buildAuthorizeUrl({ clientId: env.GMAIL_CLIENT_ID, redirectUri: env.GMAIL_REDIRECT_URI, state, loginHint }));
}
