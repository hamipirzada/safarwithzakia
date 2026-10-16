/**
 * RFC 5322 / RFC 2045 message builder for the Gmail API `raw` field.
 *
 * Header safety: every header value is checked for CR/LF and other control characters, and
 * addresses must be a single plain address. User-provided text never becomes a header
 * except the customer's validated email (Reply-To on internal notifications / To on
 * acknowledgements) and their name inside the Subject, which is encoded.
 */

import { randomUUID } from "node:crypto";

export class UnsafeHeaderError extends Error {
  constructor(field: string) {
    super(`Unsafe value for email header "${field}"`);
    this.name = "UnsafeHeaderError";
  }
}

const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
// Deliberately strict: one address, no display name, no comments, no group syntax.
const PLAIN_ADDRESS = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;

export function assertSafeAddress(field: string, address: string): void {
  if (address.length > 254 || CONTROL_CHARS.test(address) || !PLAIN_ADDRESS.test(address)) {
    throw new UnsafeHeaderError(field);
  }
}

function assertSafeText(field: string, value: string): void {
  if (CONTROL_CHARS.test(value)) throw new UnsafeHeaderError(field);
}

/** RFC 2047 encoded-word for non-ASCII header text; plain ASCII is returned unchanged. */
export function encodeHeaderText(value: string): string {
  if (/^[\x20-\x7E]*$/.test(value)) return value;
  // Split into chunks so each encoded-word stays under 75 characters.
  const words: string[] = [];
  let chunk = "";
  for (const char of value) {
    if (Buffer.byteLength(chunk + char, "utf8") > 45) {
      words.push(chunk);
      chunk = "";
    }
    chunk += char;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join("\r\n ");
}

function formatMailbox(field: string, address: string, displayName?: string): string {
  assertSafeAddress(field, address);
  if (!displayName) return address;
  assertSafeText(field, displayName);
  const name = /^[\x20-\x7E]*$/.test(displayName)
    ? `"${displayName.replace(/["\\]/g, "\\$&")}"`
    : encodeHeaderText(displayName);
  return `${name} <${address}>`;
}

function base64Lines(content: string): string {
  return Buffer.from(content, "utf8").toString("base64").replace(/.{1,76}/g, "$&\r\n").trimEnd();
}

export interface MimeMessage {
  from: { address: string; name?: string };
  to: string;
  replyTo?: string | null;
  subject: string;
  text: string;
  html: string;
  /** Domain for the Message-ID header. */
  messageIdDomain: string;
  date?: Date;
}

export function buildMimeMessage(message: MimeMessage): string {
  assertSafeText("Subject", message.subject);
  assertSafeText("Message-ID domain", message.messageIdDomain);
  const boundary = `swz_${randomUUID().replace(/-/g, "")}`;

  const headers = [
    `From: ${formatMailbox("From", message.from.address, message.from.name)}`,
    `To: ${formatMailbox("To", message.to)}`,
    ...(message.replyTo ? [`Reply-To: ${formatMailbox("Reply-To", message.replyTo)}`] : []),
    `Subject: ${encodeHeaderText(message.subject)}`,
    `Date: ${(message.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`,
    `Message-ID: <${randomUUID()}@${message.messageIdDomain}>`,
    "MIME-Version: 1.0",
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
  ];

  return [
    ...headers,
    "",
    `--${boundary}`,
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.text),
    `--${boundary}`,
    "Content-Type: text/html; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    "",
    base64Lines(message.html),
    `--${boundary}--`,
    "",
  ].join("\r\n");
}

/** Gmail API expects the full message as base64url. */
export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}
