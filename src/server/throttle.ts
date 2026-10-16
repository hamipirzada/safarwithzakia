import "server-only";
import { prisma } from "./db";

/**
 * Database-backed fixed-window rate limiter. Works across serverless instances and
 * restarts; one upsert per check. Expired rows are removed by the outbox worker's housekeeping.
 */
export interface ThrottleRule {
  /** e.g. "enquiry" */
  scope: string;
  limit: number;
  windowSeconds: number;
}

export interface ThrottleResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

export async function consumeThrottle(rule: ThrottleRule, identity: string, now = new Date()): Promise<ThrottleResult> {
  const key = `${rule.scope}:${identity}`;
  const windowStartCutoff = new Date(now.getTime() - rule.windowSeconds * 1000);

  // Atomic: start a new window if the old one has expired, otherwise increment.
  const rows = await prisma.$queryRaw<{ count: number; windowStart: Date }[]>`
    INSERT INTO "request_throttle" ("key", "count", "windowStart")
    VALUES (${key}, 1, ${now})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "request_throttle"."windowStart" <= ${windowStartCutoff} THEN 1 ELSE "request_throttle"."count" + 1 END,
      "windowStart" = CASE WHEN "request_throttle"."windowStart" <= ${windowStartCutoff} THEN ${now} ELSE "request_throttle"."windowStart" END
    RETURNING "count", "windowStart"`;

  const row = rows[0]!;
  const allowed = row.count <= rule.limit;
  const retryAfterSeconds = allowed
    ? 0
    : Math.max(1, Math.ceil((row.windowStart.getTime() + rule.windowSeconds * 1000 - now.getTime()) / 1000));
  return { allowed, retryAfterSeconds };
}

export async function purgeExpiredThrottles(olderThanSeconds = 24 * 3600, now = new Date()): Promise<number> {
  const result = await prisma.requestThrottle.deleteMany({
    where: { windowStart: { lt: new Date(now.getTime() - olderThanSeconds * 1000) } },
  });
  return result.count;
}

export const THROTTLES = {
  /** Public enquiry/contact submissions per IP. */
  enquiryPerIp: { scope: "enquiry-ip", limit: Number(process.env.ENQUIRY_RATE_LIMIT_PER_IP) || 5, windowSeconds: 10 * 60 },
  /** Public submissions per email address (catches rotating IPs). */
  enquiryPerEmail: { scope: "enquiry-email", limit: Number(process.env.ENQUIRY_RATE_LIMIT_PER_EMAIL) || 5, windowSeconds: 60 * 60 },
  /** Live price estimates per IP. */
  estimatePerIp: { scope: "estimate-ip", limit: 60, windowSeconds: 60 },
  /** Enquiry status look-ups per IP. */
  trackPerIp: { scope: "track-ip", limit: 10, windowSeconds: 10 * 60 },
} satisfies Record<string, ThrottleRule>;
