"use server";

import { after } from "next/server";
import { headers } from "next/headers";
import { normaliseReference } from "@/domain/reference";
import { trackSchema } from "@/domain/schemas";
import { STATUS_LABELS } from "@/domain/enquiry-status";
import { prisma } from "@/server/db";
import { kickOutbox } from "@/server/email/outbox";
import {
  previewTripEstimate,
  submitContact,
  submitCustomTrip,
  submitPackageEnquiry,
  type EstimateResult,
  type SubmitResult,
} from "@/server/enquiries/submit";
import { errorMessage, log } from "@/server/logger";
import { clientIp, hashIp } from "@/server/request-context";
import { THROTTLES, consumeThrottle } from "@/server/throttle";

/**
 * Public server actions. Each one validates on the server (the browser's validation is only a
 * convenience), and only reports success once the enquiry is stored in the database.
 * Notification emails are sent afterwards via the outbox and never affect the response.
 */

async function context() {
  const referer = (await headers()).get("referer");
  let sourcePage: string | null = null;
  try {
    sourcePage = referer ? new URL(referer).pathname : null;
  } catch {
    sourcePage = null;
  }
  return { ipHash: hashIp(await clientIp()), sourcePage };
}

async function run(submit: () => Promise<SubmitResult>): Promise<SubmitResult> {
  try {
    const result = await submit();
    if (result.ok) after(kickOutbox);
    return result;
  } catch (error) {
    log.error("enquiry.submit_failed", { error: errorMessage(error) });
    return { ok: false, error: "UNAVAILABLE", message: "We could not save your enquiry just now. Please try again in a moment, or contact us by phone or WhatsApp." };
  }
}

export async function submitContactAction(input: unknown): Promise<SubmitResult> {
  const ctx = await context();
  return run(() => submitContact(input, ctx));
}

export async function submitTripAction(input: unknown): Promise<SubmitResult> {
  const ctx = await context();
  return run(() => submitCustomTrip(input, ctx));
}

export async function submitPackageEnquiryAction(input: unknown): Promise<SubmitResult> {
  const ctx = await context();
  return run(() => submitPackageEnquiry(input, ctx));
}

export async function estimateTripAction(input: unknown): Promise<EstimateResult> {
  try {
    return await previewTripEstimate(input, { ipHash: hashIp(await clientIp()) });
  } catch (error) {
    log.error("estimate.failed", { error: errorMessage(error) });
    return { ok: false, error: "VALIDATION", fieldErrors: { _form: "We could not calculate an estimate right now." } };
  }
}

export type TrackResult =
  | { ok: true; reference: string; status: string; receivedOn: string }
  | { ok: false; message: string };

/**
 * Enquiry status lookup. Requires both the reference and the email used, and returns only the
 * status — never personal details. (The previous site looked bookings up by phone number alone.)
 */
export async function trackEnquiryAction(input: unknown): Promise<TrackResult> {
  const ip = hashIp(await clientIp());
  const throttle = await consumeThrottle(THROTTLES.trackPerIp, ip ?? "unknown-ip");
  if (!throttle.allowed) return { ok: false, message: "Too many look-ups. Please wait a few minutes and try again." };

  const parsed = trackSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Please enter your reference and the email address you used." };

  const enquiry = await prisma.enquiry.findUnique({
    where: { reference: normaliseReference(parsed.data.reference) },
    select: { reference: true, email: true, status: true, createdAt: true, archivedAt: true },
  });
  // Same message whether the reference or the email is wrong, so neither can be probed.
  if (!enquiry || enquiry.email !== parsed.data.email || enquiry.status === "SPAM" || enquiry.archivedAt) {
    return { ok: false, message: "We could not find an enquiry with that reference and email address." };
  }
  const publicStatus: Record<string, string> = {
    NEW: "Received — our team will be in touch soon",
    CONTACTED: "In progress — we have been in touch",
    QUOTE_PREPARATION: "We are preparing your quote",
    QUOTE_SENT: "Quote sent — please check your email",
    CONFIRMED: "Confirmed with our team",
    CLOSED: "Closed",
  };
  return {
    ok: true,
    reference: enquiry.reference,
    status: publicStatus[enquiry.status] ?? STATUS_LABELS[enquiry.status],
    receivedOn: enquiry.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Kolkata" }),
  };
}
