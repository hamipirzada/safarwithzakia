import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import type { EmailTransport, OutgoingEmail, TransportResolution } from "@/server/email/config";
import { GmailError } from "@/server/email/gmail";
import { BUSINESS_INBOX, enqueueEmail, processOutbox, retryDelivery } from "@/server/email/outbox";
import { encryptSecret } from "@/server/email/token-crypto";
import { resetDatabase } from "../support/db";

/** Test double for the Gmail transport: records messages and replays scripted outcomes. */
function fakeTransport(outcomes: (string | Error)[] = []) {
  const sent: OutgoingEmail[] = [];
  const transport: EmailTransport = {
    sender: "bookings@example.test",
    source: "connected",
    async send(message) {
      const next = outcomes.shift() ?? "gmail-id";
      if (next instanceof Error) throw next;
      sent.push(message);
      return next;
    },
  };
  const resolve = async (): Promise<TransportResolution> => ({ ok: true, transport });
  return { sent, resolve };
}

const rendered = { subject: "Subject", html: "<p>Hi</p>", text: "Hi" };
const minutes = (n: number) => n * 60_000;

beforeEach(resetDatabase);

describe("email outbox", () => {
  it("is idempotent per key", async () => {
    await enqueueEmail({ idempotencyKey: "k1", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    await enqueueEmail({ idempotencyKey: "k1", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered: { ...rendered, subject: "Other" } });
    expect(await prisma.emailDelivery.findMany({ select: { subject: true } })).toEqual([{ subject: "Subject" }]);
  });

  it("sends due emails, resolving the business inbox at send time", async () => {
    await enqueueEmail({ idempotencyKey: "i", kind: "INTERNAL_NOTIFICATION", to: BUSINESS_INBOX, replyTo: "cust@example.test", rendered });
    const fake = fakeTransport(["msg-1"]);
    const summary = await processOutbox({ resolveTransport: fake.resolve });
    expect(summary).toMatchObject({ state: "READY", claimed: 1, sent: 1 });
    expect(fake.sent[0]).toMatchObject({ to: "inbox@example.test", replyTo: "cust@example.test" });
    const row = await prisma.emailDelivery.findFirstOrThrow({ include: { attemptLog: true } });
    expect(row).toMatchObject({ status: "SENT", attempts: 1, providerMessageId: "msg-1", toAddress: "inbox@example.test", lockedUntil: null });
    expect(row.attemptLog).toMatchObject([{ attemptNumber: 1, outcome: "SUCCESS" }]);
  });

  it("never sends the same email twice once it is sent", async () => {
    await enqueueEmail({ idempotencyKey: "once", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    const fake = fakeTransport();
    await processOutbox({ resolveTransport: fake.resolve });
    await processOutbox({ resolveTransport: fake.resolve, now: new Date(Date.now() + minutes(60)) });
    expect(fake.sent).toHaveLength(1);
    expect(await retryDelivery((await prisma.emailDelivery.findFirstOrThrow()).id)).toBeNull();
  });

  it("leaves everything queued when Gmail is not configured", async () => {
    await enqueueEmail({ idempotencyKey: "u", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    const summary = await processOutbox(); // real resolver: no GMAIL_* configuration in tests
    expect(summary).toMatchObject({ state: "UNCONFIGURED", claimed: 0 });
    expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({ status: "PENDING", attempts: 0 });
  });

  it("retries transient failures with backoff, then gives up and alerts staff about failed acknowledgements", async () => {
    await enqueueEmail({ idempotencyKey: "ack", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    await prisma.emailDelivery.updateMany({ data: { maxAttempts: 2 } });
    const fake = fakeTransport([new GmailError("RETRYABLE", "backendError", "Gmail 503"), new GmailError("RETRYABLE", "backendError", "Gmail 503")]);

    const t0 = new Date();
    expect(await processOutbox({ resolveTransport: fake.resolve, now: t0 })).toMatchObject({ retrying: 1 });
    let row = await prisma.emailDelivery.findFirstOrThrow({ where: { idempotencyKey: "ack" } });
    expect(row).toMatchObject({ status: "PENDING", attempts: 1, lastErrorCode: "backendError" });
    expect(row.nextAttemptAt.getTime()).toBeGreaterThanOrEqual(t0.getTime() + minutes(1));

    // Not due yet: nothing happens.
    expect(await processOutbox({ resolveTransport: fake.resolve, now: new Date(t0.getTime() + 10_000) })).toMatchObject({ claimed: 0 });

    expect(await processOutbox({ resolveTransport: fake.resolve, now: new Date(t0.getTime() + minutes(2)) })).toMatchObject({ failed: 1 });
    row = await prisma.emailDelivery.findFirstOrThrow({ where: { idempotencyKey: "ack" } });
    expect(row).toMatchObject({ status: "FAILED", attempts: 2 });
    expect(await prisma.emailDelivery.count({ where: { kind: "DELIVERY_FAILURE_ALERT", idempotencyKey: `failure-alert:${row.id}` } })).toBe(1);
  });

  it("fails permanently on rejected messages without retrying", async () => {
    await enqueueEmail({ idempotencyKey: "bad", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    const fake = fakeTransport([new GmailError("PERMANENT", "invalidArgument", "Invalid To header")]);
    expect(await processOutbox({ resolveTransport: fake.resolve })).toMatchObject({ failed: 1 });
    expect(await prisma.emailDelivery.findFirstOrThrow({ where: { idempotencyKey: "bad" } })).toMatchObject({ status: "FAILED", attempts: 1 });
  });

  it("lets staff retry a failed email, which then sends", async () => {
    await enqueueEmail({ idempotencyKey: "r", kind: "INTERNAL_NOTIFICATION", to: BUSINESS_INBOX, rendered });
    await prisma.emailDelivery.updateMany({ data: { status: "FAILED", attempts: 6, maxAttempts: 6 } });
    const row = await prisma.emailDelivery.findFirstOrThrow();
    const retried = await retryDelivery(row.id);
    expect(retried).toMatchObject({ status: "PENDING", maxAttempts: 9 });
    const fake = fakeTransport();
    expect(await processOutbox({ resolveTransport: fake.resolve })).toMatchObject({ sent: 1 });
  });

  it("puts messages back and marks the credential revoked when Google revokes consent", async () => {
    await prisma.gmailCredential.create({ data: { id: "default", senderAddress: "bookings@example.test", encryptedRefreshToken: encryptSecret("token"), scope: "gmail.send" } });
    await enqueueEmail({ idempotencyKey: "a", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    await enqueueEmail({ idempotencyKey: "b", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "b@example.test", rendered });
    const fake = fakeTransport([new GmailError("AUTH_REVOKED", "invalid_grant", "revoked")]);
    const summary = await processOutbox({ resolveTransport: fake.resolve });
    expect(summary).toMatchObject({ state: "REVOKED", deferred: 2 });
    expect(await prisma.emailDelivery.findMany({ select: { status: true, attempts: true } })).toEqual([
      { status: "PENDING", attempts: 0 },
      { status: "PENDING", attempts: 0 },
    ]);
    expect(await prisma.gmailCredential.findUniqueOrThrow({ where: { id: "default" } })).toMatchObject({ status: "REVOKED" });
  });

  it("does not automatically resend a message whose send was interrupted", async () => {
    await enqueueEmail({ idempotencyKey: "stale", kind: "CUSTOMER_ACKNOWLEDGEMENT", to: "a@example.test", rendered });
    await prisma.emailDelivery.updateMany({ data: { status: "SENDING", lockedUntil: new Date(Date.now() - 1000) } });
    const fake = fakeTransport();
    const summary = await processOutbox({ resolveTransport: fake.resolve });
    expect(summary).toMatchObject({ recoveredStale: 1, sent: 0 });
    expect(fake.sent).toHaveLength(0);
    expect(await prisma.emailDelivery.findFirstOrThrow()).toMatchObject({ status: "FAILED", lastErrorCode: "UNKNOWN_OUTCOME" });
  });

  it("sends business-inbox mail to the address in settings, ahead of the environment default", async () => {
    await prisma.siteSetting.create({ data: { key: "email", value: { recipientEmail: "owner@example.test", sendCustomerAcknowledgement: true } } });
    await enqueueEmail({ idempotencyKey: "n", kind: "INTERNAL_NOTIFICATION", to: BUSINESS_INBOX, rendered });
    const fake = fakeTransport();
    await processOutbox({ resolveTransport: fake.resolve });
    expect(fake.sent[0]?.to).toBe("owner@example.test");
  });

  it("claims each row once even when two workers run at the same time", async () => {
    for (let i = 0; i < 6; i++) await enqueueEmail({ idempotencyKey: `c${i}`, kind: "CUSTOMER_ACKNOWLEDGEMENT", to: `c${i}@example.test`, rendered });
    const fake = fakeTransport();
    await Promise.all([processOutbox({ resolveTransport: fake.resolve }), processOutbox({ resolveTransport: fake.resolve })]);
    expect(fake.sent).toHaveLength(6);
    expect(new Set(fake.sent.map((m) => m.to)).size).toBe(6);
  });
});
