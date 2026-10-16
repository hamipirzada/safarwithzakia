import "server-only";
import type { EmailDelivery, EmailKind } from "@/generated/prisma/client";
import { prisma, type Tx } from "../db";
import { errorMessage, log } from "../logger";
import { getSetting } from "../settings";
import {
  adminUrl,
  markCredentialRevoked,
  markCredentialSuccess,
  resolveBusinessRecipient,
  resolveGmailTransport,
  type TransportResolution,
} from "./config";
import { GmailError } from "./gmail";
import { UnsafeHeaderError } from "./mime";
import { renderDeliveryFailureAlert, type RenderedEmail } from "./templates";

/**
 * Durable email outbox.
 *
 * - Rows are written in the same transaction as the enquiry, so a saved enquiry always has
 *   its notifications queued, and email problems can never lose an enquiry.
 * - `idempotencyKey` is unique: one notification per enquiry per kind, however often a
 *   submission or job is retried.
 * - Workers claim rows with FOR UPDATE SKIP LOCKED and a lease (lockedUntil). Updates after
 *   sending are fenced on that lease.
 * - A row whose lease expired while SENDING may or may not have been delivered. It is never
 *   re-sent automatically; it becomes FAILED (UNKNOWN_OUTCOME) for staff to check and retry,
 *   which prevents duplicate emails.
 */

/** Kinds addressed to the business inbox, resolved at send time from settings/env. */
const BUSINESS_INBOX_KINDS: readonly EmailKind[] = ["INTERNAL_NOTIFICATION", "DELIVERY_FAILURE_ALERT"];
export const BUSINESS_INBOX = "";

const LEASE_MS = 2 * 60 * 1000;
const DEFER_UNCONFIGURED_MS = 15 * 60 * 1000;
const BACKOFF_SECONDS = [60, 5 * 60, 15 * 60, 60 * 60, 3 * 60 * 60];

/** Delay before the next attempt after `attempts` failed attempts, with up to 10% jitter. */
export function backoffMs(attempts: number, random: () => number = Math.random): number {
  const base = BACKOFF_SECONDS[Math.min(Math.max(attempts, 1), BACKOFF_SECONDS.length) - 1]! * 1000;
  return Math.round(base * (1 + random() * 0.1));
}

export interface EnqueueEmailInput {
  idempotencyKey: string;
  kind: EmailKind;
  enquiryId?: string | null;
  /** Recipient, or BUSINESS_INBOX for business-inbox kinds. */
  to: string;
  replyTo?: string | null;
  rendered: RenderedEmail;
  expiresAt?: Date | null;
}

export async function enqueueEmail(input: EnqueueEmailInput, tx: Tx = prisma): Promise<EmailDelivery> {
  if (!BUSINESS_INBOX_KINDS.includes(input.kind) && !input.to) {
    throw new Error(`Email of kind ${input.kind} needs a recipient`);
  }
  return tx.emailDelivery.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    update: {},
    create: {
      idempotencyKey: input.idempotencyKey,
      kind: input.kind,
      enquiryId: input.enquiryId ?? null,
      toAddress: input.to,
      replyTo: input.replyTo ?? null,
      subject: input.rendered.subject,
      html: input.rendered.html,
      text: input.rendered.text,
      expiresAt: input.expiresAt ?? null,
    },
  });
}

export interface OutboxRunSummary {
  state: "READY" | "UNCONFIGURED" | "REVOKED";
  message?: string;
  claimed: number;
  sent: number;
  retrying: number;
  failed: number;
  deferred: number;
  recoveredStale: number;
}

async function recordAttempt(
  delivery: { id: string; attempts: number },
  outcome: "SUCCESS" | "RETRYABLE_ERROR" | "PERMANENT_ERROR" | "NOT_CONFIGURED",
  startedAt: Date,
  error?: { code: string; message: string },
): Promise<void> {
  await prisma.emailDeliveryAttempt.create({
    data: {
      deliveryId: delivery.id,
      attemptNumber: delivery.attempts + (outcome === "NOT_CONFIGURED" ? 0 : 1),
      outcome,
      errorCode: error?.code ?? null,
      errorMessage: error?.message.slice(0, 500) ?? null,
      startedAt,
    },
  });
}

/** Return claimed rows to the queue without counting an attempt (configuration problems). */
async function release(rows: EmailDelivery[], lease: Date, now: Date, code: string, message: string): Promise<void> {
  for (const row of rows) {
    await prisma.emailDelivery.updateMany({
      where: { id: row.id, status: "SENDING", lockedUntil: lease },
      data: { status: "PENDING", lockedUntil: null, nextAttemptAt: new Date(now.getTime() + DEFER_UNCONFIGURED_MS), lastErrorCode: code, lastErrorMessage: message },
    });
    await recordAttempt(row, "NOT_CONFIGURED", now, { code, message });
  }
}

async function alertOnAcknowledgementFailure(row: EmailDelivery, errorCode: string | null): Promise<void> {
  if (row.kind !== "CUSTOMER_ACKNOWLEDGEMENT") return;
  const [business, enquiry] = await Promise.all([
    getSetting("business"),
    row.enquiryId ? prisma.enquiry.findUnique({ where: { id: row.enquiryId }, select: { reference: true, id: true } }) : null,
  ]);
  await enqueueEmail({
    idempotencyKey: `failure-alert:${row.id}`,
    kind: "DELIVERY_FAILURE_ALERT",
    enquiryId: row.enquiryId,
    to: BUSINESS_INBOX,
    rendered: renderDeliveryFailureAlert({
      businessName: business.name,
      reference: enquiry?.reference ?? null,
      failedKind: row.kind,
      errorCode,
      adminUrl: enquiry ? adminUrl(`/admin/enquiries/${enquiry.id}`) : null,
    }),
  });
}

export async function processOutbox(
  options: { limit?: number; now?: Date; resolveTransport?: () => Promise<TransportResolution> } = {},
): Promise<OutboxRunSummary> {
  const now = options.now ?? new Date();
  const limit = Math.min(Math.max(options.limit ?? 10, 1), 50);
  const summary: OutboxRunSummary = { state: "READY", claimed: 0, sent: 0, retrying: 0, failed: 0, deferred: 0, recoveredStale: 0 };

  // 1. Interrupted sends: outcome unknown → never auto-resend.
  const stale = await prisma.$queryRaw<{ id: string; attempts: number }[]>`
    UPDATE "email_delivery"
    SET "status" = 'FAILED', "lockedUntil" = NULL, "attempts" = "attempts" + 1, "updatedAt" = ${now},
        "lastErrorCode" = 'UNKNOWN_OUTCOME',
        "lastErrorMessage" = 'Sending was interrupted, so delivery is uncertain. Check the inbox before retrying.'
    WHERE "status" = 'SENDING' AND "lockedUntil" < ${now}
    RETURNING "id", "attempts" - 1 AS "attempts"`;
  for (const row of stale) {
    await recordAttempt(row, "PERMANENT_ERROR", now, { code: "UNKNOWN_OUTCOME", message: "Lease expired during send" });
  }
  summary.recoveredStale = stale.length;

  // 2. Is sending possible at all? If not, leave everything queued.
  const resolution = await (options.resolveTransport ?? resolveGmailTransport)();
  if (!resolution.ok) {
    return { ...summary, state: resolution.state, message: resolution.message };
  }
  const { transport } = resolution;

  // 3. Claim due rows.
  const lease = new Date(now.getTime() + LEASE_MS);
  const claimedIds = await prisma.$queryRaw<{ id: string }[]>`
    UPDATE "email_delivery" SET "status" = 'SENDING', "lockedUntil" = ${lease}, "updatedAt" = ${now}
    WHERE "id" IN (
      SELECT "id" FROM "email_delivery"
      WHERE "status" = 'PENDING' AND "nextAttemptAt" <= ${now}
      ORDER BY "nextAttemptAt" ASC
      LIMIT ${limit}
      FOR UPDATE SKIP LOCKED
    )
    RETURNING "id"`;
  if (claimedIds.length === 0) return summary;

  const rows = await prisma.emailDelivery.findMany({
    where: { id: { in: claimedIds.map((r) => r.id) } },
    orderBy: { nextAttemptAt: "asc" },
  });
  summary.claimed = rows.length;

  let businessRecipient: string | null | undefined;

  for (let index = 0; index < rows.length; index++) {
    const row = rows[index]!;
    const startedAt = new Date();
    const fenced = { id: row.id, status: "SENDING" as const, lockedUntil: lease };

    if (row.expiresAt && row.expiresAt < now) {
      await prisma.emailDelivery.updateMany({
        where: fenced,
        data: { status: "CANCELLED", lockedUntil: null, lastErrorCode: "EXPIRED", lastErrorMessage: "Not sent before it expired." },
      });
      continue;
    }

    let to = row.toAddress;
    if (BUSINESS_INBOX_KINDS.includes(row.kind)) {
      businessRecipient ??= await resolveBusinessRecipient();
      to = businessRecipient ?? "";
    }
    if (!to) {
      await release([row], lease, now, "NO_RECIPIENT", "No business recipient address is configured.");
      summary.deferred++;
      continue;
    }

    try {
      const messageId = await transport.send({ to, replyTo: row.replyTo, subject: row.subject, html: row.html, text: row.text });
      await prisma.emailDelivery.updateMany({
        where: fenced,
        data: {
          status: "SENT",
          attempts: { increment: 1 },
          sentAt: new Date(),
          providerMessageId: messageId,
          toAddress: to,
          lockedUntil: null,
          lastErrorCode: null,
          lastErrorMessage: null,
        },
      });
      await recordAttempt(row, "SUCCESS", startedAt);
      summary.sent++;
      log.info("email.sent", { deliveryId: row.id, kind: row.kind });
    } catch (error) {
      const gmail = error instanceof GmailError ? error : null;
      const kind = gmail?.kind ?? (error instanceof UnsafeHeaderError ? "PERMANENT" : "RETRYABLE");
      const code = gmail?.code ?? (error instanceof UnsafeHeaderError ? "UNSAFE_HEADER" : "UNEXPECTED");
      const message = errorMessage(error);
      log.warn("email.send_failed", { deliveryId: row.id, kind: row.kind, errorKind: kind, code });

      if (kind === "AUTH_REVOKED" || kind === "CONFIG") {
        if (kind === "AUTH_REVOKED" && transport.source === "connected") await markCredentialRevoked(message);
        // The problem affects every message: put this and all remaining claimed rows back.
        const remaining = rows.slice(index);
        await release(remaining, lease, now, code, message);
        summary.deferred += remaining.length;
        return { ...summary, state: kind === "AUTH_REVOKED" ? "REVOKED" : "UNCONFIGURED", message };
      }

      const attempts = row.attempts + 1;
      const giveUp = kind === "PERMANENT" || attempts >= row.maxAttempts;
      await prisma.emailDelivery.updateMany({
        where: fenced,
        data: giveUp
          ? { status: "FAILED", attempts, lockedUntil: null, lastErrorCode: code, lastErrorMessage: message }
          : { status: "PENDING", attempts, lockedUntil: null, lastErrorCode: code, lastErrorMessage: message, nextAttemptAt: new Date(now.getTime() + backoffMs(attempts)) },
      });
      await recordAttempt(row, giveUp ? "PERMANENT_ERROR" : "RETRYABLE_ERROR", startedAt, { code, message });
      if (giveUp) {
        summary.failed++;
        await alertOnAcknowledgementFailure(row, code);
      } else {
        summary.retrying++;
      }
    }
  }

  if (summary.sent > 0 && transport.source === "connected") await markCredentialSuccess();
  return summary;
}

/** Best-effort immediate processing after a submission; the scheduled worker is the safety net. */
export async function kickOutbox(): Promise<void> {
  try {
    await processOutbox({ limit: 5 });
  } catch (error) {
    log.error("email.kick_failed", { error: errorMessage(error) });
  }
}

/** Staff action: queue a failed/cancelled delivery again (or bring a pending one forward). */
export async function retryDelivery(deliveryId: string, now = new Date()): Promise<EmailDelivery | null> {
  const row = await prisma.emailDelivery.findUnique({ where: { id: deliveryId } });
  if (!row || row.status === "SENT" || row.status === "SENDING") return null;
  return prisma.emailDelivery.update({
    where: { id: deliveryId },
    data: { status: "PENDING", nextAttemptAt: now, lockedUntil: null, maxAttempts: Math.max(row.maxAttempts, row.attempts + 3) },
  });
}

export async function cancelDelivery(deliveryId: string): Promise<boolean> {
  const result = await prisma.emailDelivery.updateMany({
    where: { id: deliveryId, status: { in: ["PENDING", "FAILED"] } },
    data: { status: "CANCELLED", lockedUntil: null },
  });
  return result.count === 1;
}
