import "server-only";
import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";
import { getEnv } from "../env";

/**
 * AES-256-GCM encryption for the stored Gmail refresh token. The key is derived from
 * AUTH_SECRET with HKDF, so rotating AUTH_SECRET requires reconnecting Gmail (documented
 * in docs/OPERATIONS.md). Format: v1.<iv>.<tag>.<ciphertext>, base64url parts.
 */

function key(): Buffer {
  return Buffer.from(hkdfSync("sha256", getEnv().AUTH_SECRET, "safar-with-zakia", "gmail-refresh-token-v1", 32));
}

export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), ciphertext.toString("base64url")].join(".");
}

export function decryptSecret(payload: string): string {
  const [version, iv, tag, ciphertext] = payload.split(".");
  if (version !== "v1" || !iv || !tag || !ciphertext) throw new Error("Unrecognised encrypted secret format");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
