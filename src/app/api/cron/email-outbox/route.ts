import { timingSafeEqual } from "node:crypto";
import { processOutbox } from "@/server/email/outbox";
import { getEnv } from "@/server/env";
import { errorMessage, log } from "@/server/logger";
import { purgeExpiredThrottles } from "@/server/throttle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Scheduled outbox worker for hosts without a long-running process (e.g. Vercel Cron,
 * Render Cron, GitHub Actions, or any external scheduler). Requires
 * "Authorization: Bearer <EMAIL_WORKER_SECRET>". Disabled when the secret is not set.
 */
async function handle(request: Request): Promise<Response> {
  const secret = getEnv().EMAIL_WORKER_SECRET;
  if (!secret) return Response.json({ error: "Worker endpoint disabled: EMAIL_WORKER_SECRET is not set." }, { status: 503 });
  const provided = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const a = Buffer.from(provided);
  const b = Buffer.from(secret);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const summary = await processOutbox({ limit: 25 });
    const purged = await purgeExpiredThrottles();
    log.info("email.worker_run", { ...summary, purgedThrottles: purged });
    return Response.json({ ...summary, purgedThrottles: purged });
  } catch (error) {
    log.error("email.worker_failed", { error: errorMessage(error) });
    return Response.json({ error: "Worker run failed" }, { status: 500 });
  }
}

export const GET = handle; // Vercel Cron issues GET requests
export const POST = handle;
