import "server-only";
import { createHmac } from "node:crypto";
import { headers } from "next/headers";
import { getEnv } from "./env";

/**
 * Client IP from proxy headers. Only trustworthy when the app runs behind a proxy that
 * overwrites these headers (Vercel, Render, Fly, nginx with proxy_set_header). Set
 * TRUST_PROXY_HEADERS=false otherwise; IP-based throttling then falls back to a shared bucket.
 */
export async function clientIp(): Promise<string | null> {
  if (getEnv().TRUST_PROXY_HEADERS !== "true") return null;
  const h = await headers();
  const forwarded = h.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = forwarded || h.get("x-real-ip")?.trim();
  return ip && ip.length <= 64 ? ip : null;
}

/** Keyed hash of an IP so raw addresses are never stored. */
export function hashIp(ip: string | null): string | null {
  if (!ip) return null;
  return createHmac("sha256", getEnv().AUTH_SECRET).update(`ip:${ip}`).digest("hex").slice(0, 32);
}

export async function userAgent(): Promise<string | null> {
  return (await headers()).get("user-agent")?.slice(0, 300) ?? null;
}
