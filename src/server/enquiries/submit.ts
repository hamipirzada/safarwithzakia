import "server-only";
import type { EnquiryType, Prisma } from "@/generated/prisma/client";
import { formatIsoDate, formatIsoMonth, isoDateToUtcDate, todayInBusinessZone } from "@/domain/dates";
import { estimateCustomTrip, estimatePackage, normalisePromoCode, type Estimate, type PromoRule } from "@/domain/pricing";
import { generateEnquiryReference } from "@/domain/reference";
import {
  contactSchema,
  customTripSchema,
  fieldErrors,
  packageEnquirySchema,
  tripEstimateSchema,
  type ContactData,
  type CustomTripData,
  type PackageEnquiryData,
} from "@/domain/schemas";
import { accommodationLabel, interestLabel, transportLabel } from "@/domain/trip-options";
import { toRateRule } from "../catalog";
import { prisma } from "../db";
import { BUSINESS_INBOX, enqueueEmail } from "../email/outbox";
import { adminUrl } from "../email/config";
import { renderCustomerAcknowledgement, renderInternalEnquiry, type EnquiryEmailData } from "../email/templates";
import { log } from "../logger";
import { getSetting } from "../settings";
import { THROTTLES, consumeThrottle } from "../throttle";

export type SubmitResult =
  | { ok: true; reference: string; estimate: Estimate | null }
  | { ok: false; error: "VALIDATION"; fieldErrors: Record<string, string> }
  | { ok: false; error: "RATE_LIMITED"; retryAfterSeconds: number }
  | { ok: false; error: "UNAVAILABLE"; message: string };

export interface SubmitContext {
  ipHash: string | null;
  sourcePage: string | null;
  now?: Date;
}

/** Submissions faster than this after the form rendered are treated as automated. */
const MIN_FILL_MS = 2500;

function looksAutomated(data: { swzCheck?: string; startedAt?: number }, now: Date): boolean {
  if (data.swzCheck && data.swzCheck.trim() !== "") return true;
  if (data.startedAt && now.getTime() - data.startedAt < MIN_FILL_MS) return true;
  return false;
}

async function throttleIp(ipHash: string | null, now: Date): Promise<SubmitResult | null> {
  // Without a trustworthy client IP, a shared bucket would let one abuser block every visitor,
  // so only the per-email limit applies. See TRUST_PROXY_HEADERS in docs/SECURITY.md.
  if (!ipHash) return null;
  const result = await consumeThrottle(THROTTLES.enquiryPerIp, ipHash, now);
  return result.allowed ? null : { ok: false, error: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds };
}

async function throttleEmail(email: string, now: Date): Promise<SubmitResult | null> {
  const result = await consumeThrottle(THROTTLES.enquiryPerEmail, email, now);
  return result.allowed ? null : { ok: false, error: "RATE_LIMITED", retryAfterSeconds: result.retryAfterSeconds };
}

async function loadPromo(code: string): Promise<PromoRule | null> {
  if (!code) return null;
  return prisma.promoCode.findUnique({
    where: { code: normalisePromoCode(code) },
    select: { code: true, discountType: true, value: true, minSubtotalPaise: true, maxDiscountPaise: true, validFrom: true, validTo: true, active: true },
  });
}

function travelDatesText(d: { dateMode: "exact" | "month"; startDate: string; travelMonth: string }): string {
  return d.dateMode === "exact" ? formatIsoDate(d.startDate) : `${formatIsoMonth(d.travelMonth)} (exact dates flexible)`;
}

// ─── Persistence shared by all enquiry types ─────────────────────────────────

interface EnquiryDraft {
  type: EnquiryType;
  spam: boolean;
  submissionKey: string | undefined;
  data: Omit<Prisma.EnquiryUncheckedCreateInput, "reference" | "type" | "status" | "snapshot" | "consentAt" | "sourcePage" | "ipHash">;
  destinations: { destinationId: string | null; nameSnapshot: string; days: number }[];
  snapshot: Prisma.InputJsonObject;
  email: Omit<EnquiryEmailData, "reference" | "adminUrl" | "businessName">;
  estimate: Estimate | null;
}

async function persist(draft: EnquiryDraft, ctx: SubmitContext, now: Date): Promise<SubmitResult> {
  const submissionKey = draft.submissionKey;
  const existing = async () =>
    submissionKey ? prisma.enquiry.findUnique({ where: { submissionKey }, select: { reference: true } }) : null;

  // Same form submitted twice (double click, network retry): return the original enquiry.
  const duplicate = await existing();
  if (duplicate) return { ok: true, reference: duplicate.reference, estimate: draft.spam ? null : draft.estimate };

  const [business, emailSettings] = await Promise.all([getSetting("business"), getSetting("email")]);

  for (let attempt = 0; attempt < 5; attempt++) {
    const reference = generateEnquiryReference(now);
    try {
      const enquiry = await prisma.$transaction(async (tx) => {
        const created = await tx.enquiry.create({
          data: {
            ...draft.data,
            reference,
            submissionKey: submissionKey ?? null,
            type: draft.type,
            status: draft.spam ? "SPAM" : "NEW",
            snapshot: draft.snapshot,
            consentAt: now,
            sourcePage: ctx.sourcePage?.slice(0, 200) ?? null,
            ipHash: ctx.ipHash,
            createdAt: now,
            destinations: { create: draft.destinations.map((d, position) => ({ ...d, position })) },
            statusHistory: {
              create: { fromStatus: null, toStatus: draft.spam ? "SPAM" : "NEW", note: draft.spam ? "Automatically flagged by spam checks" : "Submitted on website" },
            },
          },
          select: { id: true },
        });

        if (!draft.spam) {
          const emailData: EnquiryEmailData = { ...draft.email, reference, businessName: business.name, adminUrl: adminUrl(`/admin/enquiries/${created.id}`) };
          await enqueueEmail(
            {
              idempotencyKey: `enquiry:${created.id}:internal`,
              kind: "INTERNAL_NOTIFICATION",
              enquiryId: created.id,
              to: BUSINESS_INBOX,
              replyTo: draft.email.email,
              rendered: renderInternalEnquiry(emailData),
            },
            tx,
          );
          if (emailSettings.sendCustomerAcknowledgement) {
            await enqueueEmail(
              {
                idempotencyKey: `enquiry:${created.id}:ack`,
                kind: "CUSTOMER_ACKNOWLEDGEMENT",
                enquiryId: created.id,
                to: draft.email.email,
                replyTo: business.email || null,
                rendered: renderCustomerAcknowledgement({
                  ...emailData,
                  adminUrl: null,
                  contactPhone: business.phone || null,
                  whatsappUrl: business.whatsappE164 ? `https://wa.me/${business.whatsappE164.slice(1)}` : null,
                }),
              },
              tx,
            );
          }
        }
        return created;
      });

      log.info("enquiry.created", { enquiryId: enquiry.id, reference, type: draft.type, spam: draft.spam });
      return { ok: true, reference, estimate: draft.spam ? null : draft.estimate };
    } catch (error) {
      const isReferenceCollision =
        typeof error === "object" && error !== null && "code" in error && (error as { code?: string }).code === "P2002";
      if (isReferenceCollision) {
        // Either a concurrent duplicate submission won the race, or the random reference collided.
        const raced = await existing();
        if (raced) return { ok: true, reference: raced.reference, estimate: draft.spam ? null : draft.estimate };
        if (attempt < 4) continue;
      }
      throw error;
    }
  }
  return { ok: false, error: "UNAVAILABLE", message: "We could not save your enquiry. Please try again." };
}

function baseSnapshot(type: EnquiryType, submitted: Record<string, unknown>, estimate: Estimate | null, extra: Record<string, unknown> = {}) {
  // Remove anti-spam and consent fields; keep everything the customer actually asked for.
  const { swzCheck: _h, startedAt: _s, consent: _c, submissionKey: _k, ...rest } = submitted;
  return JSON.parse(JSON.stringify({ version: 1, type, submitted: rest, estimate, ...extra })) as Prisma.InputJsonObject;
}

// ─── Contact ─────────────────────────────────────────────────────────────────

export async function submitContact(raw: unknown, ctx: SubmitContext): Promise<SubmitResult> {
  const now = ctx.now ?? new Date();
  const limited = await throttleIp(ctx.ipHash, now);
  if (limited) return limited;

  const parsed = contactSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  const data: ContactData = parsed.data;

  const emailLimited = await throttleEmail(data.email, now);
  if (emailLimited) return emailLimited;

  return persist(
    {
      type: "CONTACT",
      spam: looksAutomated(data, now),
      submissionKey: data.submissionKey,
      data: { customerName: data.name, email: data.email, phone: data.phone || null, message: data.message, estimateStatus: "NOT_APPLICABLE" },
      destinations: [],
      snapshot: baseSnapshot("CONTACT", data, null),
      estimate: null,
      email: {
        type: "CONTACT",
        submittedAt: now,
        customerName: data.name,
        email: data.email,
        phone: data.phone || null,
        message: data.message,
        packageTitle: null,
        destinations: [],
        travelDates: null,
        durationDays: null,
        adults: null,
        children: null,
        accommodation: null,
        transport: null,
        interests: [],
        addons: [],
        budget: null,
        promoCode: null,
        estimate: null,
      },
    },
    ctx,
    now,
  );
}

// ─── Custom trip ─────────────────────────────────────────────────────────────

async function priceTrip(
  legs: { destinationId: string; days: number }[],
  travellers: { adults: number; children: number },
  dates: { dateMode: "exact" | "month"; startDate: string },
  promoCode: string,
  now: Date,
): Promise<{ ok: true; estimate: Estimate; names: Map<string, string> } | { ok: false; fieldErrors: Record<string, string> }> {
  const ids = [...new Set(legs.map((l) => l.destinationId))];
  const destinations = await prisma.destination.findMany({
    where: { id: { in: ids }, status: "PUBLISHED" },
    select: { id: true, name: true, pricingRules: { where: { active: true } } },
  });
  const byId = new Map(destinations.map((d) => [d.id, d]));
  const errors: Record<string, string> = {};
  legs.forEach((leg, i) => {
    if (!byId.has(leg.destinationId)) errors[`legs.${i}.destinationId`] = "This destination is no longer available. Please choose another.";
  });
  if (Object.keys(errors).length) return { ok: false, fieldErrors: errors };

  const estimate = estimateCustomTrip({
    legs: legs.map((l) => {
      const d = byId.get(l.destinationId)!;
      return { name: d.name, days: l.days, rules: d.pricingRules.map(toRateRule) };
    }),
    travellers,
    startDate: dates.dateMode === "exact" ? dates.startDate : null,
    promoCode: promoCode || null,
    promo: await loadPromo(promoCode),
    now,
  });
  return { ok: true, estimate, names: new Map(destinations.map((d) => [d.id, d.name])) };
}

export type EstimateResult =
  | { ok: true; estimate: Estimate }
  | { ok: false; error: "VALIDATION"; fieldErrors: Record<string, string> }
  | { ok: false; error: "RATE_LIMITED"; retryAfterSeconds: number };

/** Live estimate for the trip builder. Read-only; the same calculation runs again on submit. */
export async function previewTripEstimate(raw: unknown, ctx: { ipHash: string | null; now?: Date }): Promise<EstimateResult> {
  const now = ctx.now ?? new Date();
  const throttle = await consumeThrottle(THROTTLES.estimatePerIp, ctx.ipHash ?? "unknown-ip", now);
  if (!throttle.allowed) return { ok: false, error: "RATE_LIMITED", retryAfterSeconds: throttle.retryAfterSeconds };

  const parsed = tripEstimateSchema(todayInBusinessZone(now)).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  const d = parsed.data;
  const priced = await priceTrip(d.legs, d, d, d.promoCode, now);
  if (!priced.ok) return { ok: false, error: "VALIDATION", fieldErrors: priced.fieldErrors };
  return { ok: true, estimate: priced.estimate };
}

export async function submitCustomTrip(raw: unknown, ctx: SubmitContext): Promise<SubmitResult> {
  const now = ctx.now ?? new Date();
  const limited = await throttleIp(ctx.ipHash, now);
  if (limited) return limited;

  const parsed = customTripSchema(todayInBusinessZone(now)).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  const d: CustomTripData = parsed.data;

  const emailLimited = await throttleEmail(d.email, now);
  if (emailLimited) return emailLimited;

  const priced = await priceTrip(d.legs, d, d, d.promoCode, now);
  if (!priced.ok) return { ok: false, error: "VALIDATION", fieldErrors: priced.fieldErrors };
  const { estimate, names } = priced;
  const durationDays = d.legs.reduce((n, l) => n + l.days, 0);
  const legs = d.legs.map((l) => ({ destinationId: l.destinationId, nameSnapshot: names.get(l.destinationId)!, days: l.days }));

  return persist(
    {
      type: "CUSTOM_TRIP",
      spam: looksAutomated(d, now),
      submissionKey: d.submissionKey,
      data: {
        customerName: d.name,
        email: d.email,
        phone: d.phone,
        message: d.message || null,
        travelStartDate: d.dateMode === "exact" ? isoDateToUtcDate(d.startDate) : null,
        travelMonth: d.dateMode === "month" ? d.travelMonth : d.startDate.slice(0, 7),
        durationDays,
        adults: d.adults,
        children: d.children,
        accommodationPreference: d.accommodation,
        transportPreference: d.transport,
        interests: d.interests,
        budget: d.budget || null,
        promoCode: d.promoCode || null,
        estimateStatus: estimate.kind === "ESTIMATED" ? "ESTIMATED" : "QUOTE_REQUIRED",
        estimateTotalPaise: estimate.kind === "ESTIMATED" ? estimate.totalPaise : null,
      },
      destinations: legs,
      snapshot: baseSnapshot("CUSTOM_TRIP", d, estimate, { destinations: legs.map((l) => ({ id: l.destinationId, name: l.nameSnapshot, days: l.days })) }),
      estimate,
      email: {
        type: "CUSTOM_TRIP",
        submittedAt: now,
        customerName: d.name,
        email: d.email,
        phone: d.phone,
        message: d.message || null,
        packageTitle: null,
        destinations: legs.map((l) => ({ name: l.nameSnapshot, days: l.days })),
        travelDates: travelDatesText(d),
        durationDays,
        adults: d.adults,
        children: d.children,
        accommodation: accommodationLabel(d.accommodation),
        transport: transportLabel(d.transport),
        interests: d.interests.map(interestLabel),
        addons: [],
        budget: d.budget || null,
        promoCode: d.promoCode || null,
        estimate,
      },
    },
    ctx,
    now,
  );
}

// ─── Package enquiry ─────────────────────────────────────────────────────────

export async function submitPackageEnquiry(raw: unknown, ctx: SubmitContext): Promise<SubmitResult> {
  const now = ctx.now ?? new Date();
  const limited = await throttleIp(ctx.ipHash, now);
  if (limited) return limited;

  const parsed = packageEnquirySchema(todayInBusinessZone(now)).safeParse(raw);
  if (!parsed.success) return { ok: false, error: "VALIDATION", fieldErrors: fieldErrors(parsed.error) };
  const d: PackageEnquiryData = parsed.data;

  const emailLimited = await throttleEmail(d.email, now);
  if (emailLimited) return emailLimited;

  const pkg = await prisma.package.findFirst({
    where: { id: d.packageId, status: "PUBLISHED" },
    include: {
      pricingRules: { where: { active: true } },
      addons: { where: { active: true } },
      destinations: { orderBy: { position: "asc" }, include: { destination: { select: { name: true } } } },
    },
  });
  if (!pkg) return { ok: false, error: "VALIDATION", fieldErrors: { _form: "This package is no longer available. Please contact us or build a custom trip." } };

  const addonIds = new Set(d.addonIds);
  const addons = pkg.addons.filter((a) => addonIds.has(a.id));
  if (addons.length !== addonIds.size) return { ok: false, error: "VALIDATION", fieldErrors: { addonIds: "One of the selected add-ons is no longer available." } };

  const estimate = estimatePackage({
    packageTitle: pkg.title,
    durationDays: pkg.durationDays,
    rules: pkg.pricingRules.map(toRateRule),
    addons: addons.map((a) => ({ id: a.id, name: a.name, basis: a.basis, amountPaise: a.amountPaise })),
    travellers: d,
    startDate: d.dateMode === "exact" ? d.startDate : null,
    promoCode: d.promoCode || null,
    promo: await loadPromo(d.promoCode),
    now,
  });
  const legs = pkg.destinations.map((pd) => ({ destinationId: pd.destinationId, nameSnapshot: pd.destination.name, days: pd.days }));

  return persist(
    {
      type: "PACKAGE",
      spam: looksAutomated(d, now),
      submissionKey: d.submissionKey,
      data: {
        customerName: d.name,
        email: d.email,
        phone: d.phone,
        message: d.message || null,
        packageId: pkg.id,
        travelStartDate: d.dateMode === "exact" ? isoDateToUtcDate(d.startDate) : null,
        travelMonth: d.dateMode === "month" ? d.travelMonth : d.startDate.slice(0, 7),
        durationDays: pkg.durationDays,
        adults: d.adults,
        children: d.children,
        accommodationPreference: d.accommodation,
        promoCode: d.promoCode || null,
        estimateStatus: estimate.kind === "ESTIMATED" ? "ESTIMATED" : "QUOTE_REQUIRED",
        estimateTotalPaise: estimate.kind === "ESTIMATED" ? estimate.totalPaise : null,
      },
      destinations: legs,
      snapshot: baseSnapshot("PACKAGE", d, estimate, {
        package: { id: pkg.id, slug: pkg.slug, title: pkg.title, durationDays: pkg.durationDays, durationNights: pkg.durationNights },
        addons: addons.map((a) => ({ id: a.id, name: a.name, basis: a.basis, amountPaise: a.amountPaise })),
      }),
      estimate,
      email: {
        type: "PACKAGE",
        submittedAt: now,
        customerName: d.name,
        email: d.email,
        phone: d.phone,
        message: d.message || null,
        packageTitle: pkg.title,
        destinations: legs.map((l) => ({ name: l.nameSnapshot, days: l.days })),
        travelDates: travelDatesText(d),
        durationDays: pkg.durationDays,
        adults: d.adults,
        children: d.children,
        accommodation: accommodationLabel(d.accommodation),
        transport: null,
        interests: [],
        addons: addons.map((a) => a.name),
        budget: null,
        promoCode: d.promoCode || null,
        estimate,
      },
    },
    ctx,
    now,
  );
}
