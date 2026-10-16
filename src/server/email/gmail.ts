import "server-only";
import { getEnv } from "../env";

/**
 * Gmail API client: OAuth 2.0 refresh-token exchange and users.messages.send.
 * Uses only the `gmail.send` scope (send mail; no read access to the mailbox).
 *
 * Docs: https://developers.google.com/workspace/gmail/api/guides/sending
 *       https://developers.google.com/identity/protocols/oauth2/web-server
 */

export const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
/** Also requested at connect time so we can show which address was authorised. */
export const OPENID_EMAIL_SCOPES = ["openid", "email"];

function oauthBase(): string {
  return getEnv().TEST_GOOGLE_OAUTH_BASE_URL ?? "https://oauth2.googleapis.com";
}
function gmailBase(): string {
  return getEnv().TEST_GMAIL_API_BASE_URL ?? "https://gmail.googleapis.com";
}
export const GOOGLE_AUTHORIZE_URL = "https://accounts.google.com/o/oauth2/v2/auth";

/** How the outbox should treat a failure. */
export type GmailErrorKind =
  | "AUTH_REVOKED" // invalid_grant: consent revoked, token expired or password changed → reconnect
  | "CONFIG" // invalid_client, insufficient scope: fix configuration
  | "RETRYABLE" // network, 429, 5xx
  | "PERMANENT"; // the message itself was rejected (e.g. invalid recipient)

export class GmailError extends Error {
  constructor(
    readonly kind: GmailErrorKind,
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "GmailError";
  }
}

export interface GmailClientConfig {
  clientId: string;
  clientSecret: string;
  refreshToken: string;
}

const REQUEST_TIMEOUT_MS = 15_000;

async function request(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS), cache: "no-store" });
  } catch (error) {
    const name = error instanceof Error ? error.name : "Error";
    throw new GmailError("RETRYABLE", name === "TimeoutError" ? "TIMEOUT" : "NETWORK", `Request to Google failed: ${name}`);
  }
}

async function readError(response: Response): Promise<{ code: string; description: string }> {
  const body = (await response.json().catch(() => null)) as
    | { error?: string | { status?: string; message?: string; errors?: { reason?: string }[] }; error_description?: string }
    | null;
  if (!body?.error) return { code: `HTTP_${response.status}`, description: response.statusText };
  if (typeof body.error === "string") return { code: body.error, description: body.error_description ?? body.error };
  const reason = body.error.errors?.[0]?.reason;
  return { code: reason ?? body.error.status ?? `HTTP_${response.status}`, description: body.error.message ?? "" };
}

// Access tokens are cached per refresh token for their lifetime (minus a safety margin).
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

export function clearAccessTokenCache(): void {
  tokenCache.clear();
}

export async function getAccessToken(config: GmailClientConfig, now = Date.now()): Promise<string> {
  const cached = tokenCache.get(config.refreshToken);
  if (cached && cached.expiresAt > now) return cached.token;

  const response = await request(`${oauthBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
  });

  if (!response.ok) {
    const { code, description } = await readError(response);
    if (code === "invalid_grant") throw new GmailError("AUTH_REVOKED", code, "Gmail authorisation was revoked or has expired. Reconnect Gmail in Email settings.");
    if (code === "invalid_client" || code === "unauthorized_client") throw new GmailError("CONFIG", code, "Google rejected the OAuth client credentials.");
    if (response.status >= 500 || response.status === 429) throw new GmailError("RETRYABLE", code, `Google token endpoint unavailable: ${description}`);
    throw new GmailError("CONFIG", code, `Token refresh failed: ${description}`);
  }

  const body = (await response.json()) as { access_token: string; expires_in: number };
  tokenCache.set(config.refreshToken, { token: body.access_token, expiresAt: now + Math.max(0, body.expires_in - 120) * 1000 });
  return body.access_token;
}

/** Send a base64url-encoded RFC 5322 message. Returns the Gmail message id. */
export async function sendRawMessage(config: GmailClientConfig, rawBase64Url: string): Promise<string> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await getAccessToken(config);
    const response = await request(`${gmailBase()}/gmail/v1/users/me/messages/send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({ raw: rawBase64Url }),
    });

    if (response.ok) {
      const body = (await response.json()) as { id?: string };
      return body.id ?? "unknown";
    }

    const { code, description } = await readError(response);
    if (response.status === 401 && attempt === 0) {
      // Access token expired early or was revoked; refresh once.
      tokenCache.delete(config.refreshToken);
      continue;
    }
    if (response.status === 401) throw new GmailError("AUTH_REVOKED", code, "Gmail rejected the access token.");
    if (response.status === 429 || response.status >= 500) throw new GmailError("RETRYABLE", code, `Gmail temporarily unavailable: ${description}`);
    if (response.status === 403 && /rate|quota|limit/i.test(code)) throw new GmailError("RETRYABLE", code, `Gmail sending limit reached: ${description}`);
    if (response.status === 403) throw new GmailError("CONFIG", code, `Gmail refused to send: ${description}`);
    throw new GmailError("PERMANENT", code, `Gmail rejected the message: ${description}`);
  }
  throw new GmailError("RETRYABLE", "UNREACHABLE", "Gmail send did not complete");
}

// ─── OAuth authorisation-code flow (connect mailbox) ─────────────────────────

export function buildAuthorizeUrl(opts: { clientId: string; redirectUri: string; state: string; loginHint?: string }): string {
  const params = new URLSearchParams({
    client_id: opts.clientId,
    redirect_uri: opts.redirectUri,
    response_type: "code",
    scope: [GMAIL_SEND_SCOPE, ...OPENID_EMAIL_SCOPES].join(" "),
    access_type: "offline",
    // Always show consent so Google issues a refresh token even on reconnect.
    prompt: "consent",
    include_granted_scopes: "false",
    state: opts.state,
  });
  if (opts.loginHint) params.set("login_hint", opts.loginHint);
  return `${GOOGLE_AUTHORIZE_URL}?${params.toString()}`;
}

export interface CodeExchangeResult {
  refreshToken: string;
  scope: string;
  email: string | null;
}

export async function exchangeAuthorizationCode(opts: {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  code: string;
}): Promise<CodeExchangeResult> {
  const response = await request(`${oauthBase()}/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: opts.code,
      client_id: opts.clientId,
      client_secret: opts.clientSecret,
      redirect_uri: opts.redirectUri,
    }),
  });
  if (!response.ok) {
    const { code } = await readError(response);
    throw new GmailError("CONFIG", code, "Google did not accept the authorisation code.");
  }
  const body = (await response.json()) as { refresh_token?: string; scope?: string; id_token?: string };
  if (!body.refresh_token) {
    throw new GmailError("CONFIG", "no_refresh_token", "Google did not return a refresh token. Remove the app's access in the Google account and connect again.");
  }
  return { refreshToken: body.refresh_token, scope: body.scope ?? "", email: emailFromIdToken(body.id_token) };
}

/**
 * Read the email claim from the ID token returned directly by Google's token endpoint over TLS.
 * The token is not used for authentication, only to display/record the authorised address,
 * so signature verification is not required here.
 */
function emailFromIdToken(idToken: string | undefined): string | null {
  if (!idToken) return null;
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1] ?? "", "base64url").toString("utf8")) as { email?: string; email_verified?: boolean };
    return payload.email && payload.email_verified !== false ? payload.email.toLowerCase() : null;
  } catch {
    return null;
  }
}
