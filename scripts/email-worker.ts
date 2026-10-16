/**
 * Long-running outbox worker for servers/containers (VPS, Docker, Render background worker).
 * Processes due emails every 30 seconds. Safe to run alongside the web app and the cron
 * endpoint: rows are claimed with FOR UPDATE SKIP LOCKED.
 *
 *   npm run worker:email
 */
import "dotenv/config";
import { processOutbox } from "../src/server/email/outbox";
import { purgeExpiredThrottles } from "../src/server/throttle";

const INTERVAL_MS = 30_000;
let stopping = false;

async function tick(): Promise<void> {
  try {
    const summary = await processOutbox({ limit: 25 });
    if (summary.claimed || summary.recoveredStale || summary.state !== "READY") {
      console.log(JSON.stringify({ level: "info", event: "email.worker_tick", time: new Date().toISOString(), ...summary }));
    }
    if (Math.random() < 0.02) await purgeExpiredThrottles();
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "email.worker_tick_failed", message: error instanceof Error ? error.message : String(error) }));
  }
}

async function main(): Promise<void> {
  console.log(JSON.stringify({ level: "info", event: "email.worker_started", intervalMs: INTERVAL_MS }));
  for (const signal of ["SIGINT", "SIGTERM"] as const) process.on(signal, () => (stopping = true));
  while (!stopping) {
    await tick();
    for (let waited = 0; waited < INTERVAL_MS && !stopping; waited += 500) await new Promise((r) => setTimeout(r, 500));
  }
  console.log(JSON.stringify({ level: "info", event: "email.worker_stopped" }));
  process.exit(0);
}

void main();
