import "server-only";
import { prisma } from "../db";
import { getEnv } from "../env";
import { log } from "../logger";
import { getSetting } from "../settings";
import { buildMimeMessage, toBase64Url } from "./mime";
import { decryptSecret } from "./token-crypto";
import { sendRawMessage, type GmailClientConfig } from "./gmail";

export const GMAIL_CREDENTIAL_ID = "default";

export interface OutgoingEmail {
  to: string;
  replyTo: string | null;
  subject: string;
  html: string;
  text: string;
}

/** A configured way to send mail. Tests substitute their own implementation. */
export interface EmailTransport {
  sender: string;
  source: "connected" | "environment" | "test";
  send(message: OutgoingEmail): Promise<string>;
}

export type TransportResolution =
  | { ok: true; transport: EmailTransport }
  | { ok: false; state: "UNCONFIGURED" | "REVOKED"; message: string };

export async function resolveBusinessRecipient(): Promise<string | null> {
  const settings = await getSetting("email");
  return settings.recipientEmail || getEnv().ENQUIRY_RECIPIENT_EMAIL || null;
}

/**
 * Resolve Gmail credentials. A mailbox connected through the admin (stored encrypted in the
 * database) takes precedence over GMAIL_REFRESH_TOKEN + GMAIL_SENDER_ADDRESS from the environment.
 */
export async function resolveGmailTransport(): Promise<TransportResolution> {
  const env = getEnv();
  if (!env.GMAIL_CLIENT_ID || !env.GMAIL_CLIENT_SECRET) {
    return { ok: false, state: "UNCONFIGURED", message: "GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are not set." };
  }

  const credential = await prisma.gmailCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  let refreshToken: string | undefined;
  let sender: string | undefined;
  let source: EmailTransport["source"] = "environment";

  if (credential) {
    if (credential.status === "REVOKED") {
      return { ok: false, state: "REVOKED", message: "Gmail access was revoked or expired. Reconnect Gmail in Email settings." };
    }
    try {
      refreshToken = decryptSecret(credential.encryptedRefreshToken);
      sender = credential.senderAddress;
      source = "connected";
    } catch {
      log.error("email.credential_decrypt_failed");
      return { ok: false, state: "REVOKED", message: "The stored Gmail authorisation cannot be read (was AUTH_SECRET changed?). Reconnect Gmail." };
    }
  } else if (env.GMAIL_REFRESH_TOKEN && env.GMAIL_SENDER_ADDRESS) {
    refreshToken = env.GMAIL_REFRESH_TOKEN;
    sender = env.GMAIL_SENDER_ADDRESS;
  }

  if (!refreshToken || !sender) {
    return { ok: false, state: "UNCONFIGURED", message: "No Gmail mailbox is connected." };
  }

  const client: GmailClientConfig = { clientId: env.GMAIL_CLIENT_ID, clientSecret: env.GMAIL_CLIENT_SECRET, refreshToken };
  const business = await getSetting("business");
  const domain = sender.split("@")[1] ?? "localhost";

  return {
    ok: true,
    transport: {
      sender,
      source,
      async send(message) {
        const raw = buildMimeMessage({
          from: { address: sender, name: business.name },
          to: message.to,
          replyTo: message.replyTo,
          subject: message.subject,
          text: message.text,
          html: message.html,
          messageIdDomain: domain,
        });
        return sendRawMessage(client, toBase64Url(raw));
      },
    },
  };
}

export async function markCredentialRevoked(message: string): Promise<void> {
  await prisma.gmailCredential.updateMany({
    where: { id: GMAIL_CREDENTIAL_ID },
    data: { status: "REVOKED", lastErrorAt: new Date(), lastError: message.slice(0, 300) },
  });
}

export async function markCredentialSuccess(): Promise<void> {
  await prisma.gmailCredential.updateMany({ where: { id: GMAIL_CREDENTIAL_ID, status: "ACTIVE" }, data: { lastSuccessAt: new Date() } });
}

export function adminUrl(path: string): string {
  return new URL(path, getEnv().APP_URL).toString();
}
