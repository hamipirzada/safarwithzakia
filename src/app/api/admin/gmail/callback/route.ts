import { timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { audit } from "@/server/audit";
import { AuthorizationError, requireStaff } from "@/server/authz";
import { prisma } from "@/server/db";
import { GMAIL_CREDENTIAL_ID } from "@/server/email/config";
import { clearAccessTokenCache, exchangeAuthorizationCode, GMAIL_SEND_SCOPE, GmailError } from "@/server/email/gmail";
import { encryptSecret } from "@/server/email/token-crypto";
import { getEnv } from "@/server/env";
import { log } from "@/server/logger";

export const dynamic = "force-dynamic";
const STATE_COOKIE = "swz_gmail_oauth_state";

function back(error: string | null) {
  const url = new URL("/admin/email-settings", getEnv().APP_URL);
  if (error) url.searchParams.set("error", error);
  else url.searchParams.set("connected", "1");
  return NextResponse.redirect(url);
}

/** Google redirects here after consent. Verifies state and the admin session, then stores the token encrypted. */
export async function GET(request: Request) {
  let user;
  try {
    user = await requireStaff("ADMIN");
  } catch (error) {
    if (error instanceof AuthorizationError) return NextResponse.redirect(new URL("/admin/login", getEnv().APP_URL));
    throw error;
  }

  const params = new URL(request.url).searchParams;
  const jar = await cookies();
  const expected = jar.get(STATE_COOKIE)?.value;
  jar.delete({ name: STATE_COOKIE, path: "/api/admin/gmail" });
  const state = params.get("state") ?? "";
  if (!expected || expected.length !== state.length || !timingSafeEqual(Buffer.from(expected), Buffer.from(state))) return back("state_mismatch");
  if (params.get("error")) return back("consent_denied");
  const code = params.get("code");
  if (!code) return back("no_code");

  const env = getEnv();
  try {
    const result = await exchangeAuthorizationCode({ clientId: env.GMAIL_CLIENT_ID!, clientSecret: env.GMAIL_CLIENT_SECRET!, redirectUri: env.GMAIL_REDIRECT_URI!, code });
    if (!result.scope.split(" ").includes(GMAIL_SEND_SCOPE)) return back("scope_missing");
    const sender = result.email ?? env.GMAIL_SENDER_ADDRESS;
    if (!sender) return back("no_email");

    await prisma.gmailCredential.upsert({
      where: { id: GMAIL_CREDENTIAL_ID },
      create: { id: GMAIL_CREDENTIAL_ID, senderAddress: sender, encryptedRefreshToken: encryptSecret(result.refreshToken), scope: result.scope, connectedById: user.id },
      update: { senderAddress: sender, encryptedRefreshToken: encryptSecret(result.refreshToken), scope: result.scope, status: "ACTIVE", connectedById: user.id, connectedAt: new Date(), lastError: null, lastErrorAt: null },
    });
    clearAccessTokenCache();
    // Messages waiting because Gmail was unavailable can go now.
    await prisma.emailDelivery.updateMany({ where: { status: "PENDING" }, data: { nextAttemptAt: new Date() } });
    await audit({ actorId: user.id, action: "email.gmail_connected", entityType: "GmailCredential", entityId: GMAIL_CREDENTIAL_ID, metadata: { sender } });
    return back(null);
  } catch (error) {
    log.warn("email.gmail_connect_failed", { code: error instanceof GmailError ? error.code : "unexpected" });
    return back(error instanceof GmailError ? error.code : "exchange_failed");
  }
}
