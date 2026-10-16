"use server";

import { z } from "zod";
import { adminAction, formCheckbox, UserFacingError } from "@/server/admin/action";
import { audit } from "@/server/audit";
import { prisma } from "@/server/db";
import { GMAIL_CREDENTIAL_ID, resolveBusinessRecipient } from "@/server/email/config";
import { clearAccessTokenCache } from "@/server/email/gmail";
import { enqueueEmail, processOutbox } from "@/server/email/outbox";
import { renderTestEmail } from "@/server/email/templates";
import { decryptSecret } from "@/server/email/token-crypto";
import { getSetting, saveSetting } from "@/server/settings";

export const saveEmailSettingsAction = adminAction(
  "ADMIN",
  z.object({ recipientEmail: z.union([z.literal(""), z.email("Enter a valid email address.")]), sendCustomerAcknowledgement: formCheckbox }),
  async (data, user) => {
    await saveSetting("email", data, user.id);
    await audit({ actorId: user.id, action: "email.settings_updated", entityType: "SiteSetting", entityId: "email", metadata: data });
    if (data.recipientEmail) await prisma.emailDelivery.updateMany({ where: { status: "PENDING", lastErrorCode: "NO_RECIPIENT" }, data: { nextAttemptAt: new Date() } });
    return { status: "success", message: "Email settings saved." };
  },
);

/** Sends a real test message to the business inbox and reports what actually happened. */
export const sendTestEmailAction = adminAction("ADMIN", z.object({}), async (_input, user) => {
  const recipient = await resolveBusinessRecipient();
  if (!recipient) throw new UserFacingError("Set the business inbox address first.");
  const business = await getSetting("business");
  const delivery = await enqueueEmail({ idempotencyKey: `test:${user.id}:${Date.now()}`, kind: "TEST", to: recipient, rendered: renderTestEmail({ businessName: business.name, sentBy: user.name, at: new Date() }) });
  const run = await processOutbox({ limit: 10 });
  const row = await prisma.emailDelivery.findUnique({ where: { id: delivery.id } });
  await audit({ actorId: user.id, action: "email.test_sent", entityType: "EmailDelivery", entityId: delivery.id, metadata: { status: row?.status ?? "unknown" } });
  if (row?.status === "SENT") return { status: "success", message: `Gmail accepted the test email to ${recipient}. Check that inbox to confirm it arrived.` };
  if (run.state !== "READY") return { status: "error", message: `Not sent: ${run.message ?? "email is not configured."}` };
  return { status: "error", message: `Not sent yet (${row?.status.toLowerCase()}): ${row?.lastErrorMessage ?? "it is queued and will be retried."}` };
});

export const processQueueAction = adminAction("ADMIN", z.object({}), async () => {
  const run = await processOutbox({ limit: 25 });
  if (run.state !== "READY") return { status: "error", message: `Nothing sent: ${run.message}` };
  return { status: "success", message: `Processed ${run.claimed}: ${run.sent} sent, ${run.retrying} will retry, ${run.failed} failed, ${run.deferred} waiting.` };
});

export const disconnectGmailAction = adminAction("ADMIN", z.object({}), async (_input, user) => {
  const credential = await prisma.gmailCredential.findUnique({ where: { id: GMAIL_CREDENTIAL_ID } });
  if (!credential) throw new UserFacingError("No mailbox is connected.");
  // Best effort: also revoke the grant at Google so the token cannot be reused.
  try {
    await fetch("https://oauth2.googleapis.com/revoke", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ token: decryptSecret(credential.encryptedRefreshToken) }), signal: AbortSignal.timeout(10_000) });
  } catch {
    /* the local credential is still removed */
  }
  await prisma.gmailCredential.delete({ where: { id: GMAIL_CREDENTIAL_ID } });
  clearAccessTokenCache();
  await audit({ actorId: user.id, action: "email.gmail_disconnected", entityType: "GmailCredential", entityId: GMAIL_CREDENTIAL_ID });
  return { status: "success", message: "Gmail disconnected. Emails will queue until a mailbox is connected again." };
});
