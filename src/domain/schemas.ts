/**
 * Validation schemas for public forms. The server always re-validates with these;
 * the browser uses the same schemas only to show field errors early.
 */

import { z } from "zod";

// No runtime code generation: keeps validation compatible with the strict Content-Security-Policy.
z.config({ jitless: true });
import { addMonthsToMonth, isIsoDate, isIsoMonth } from "./dates";
import { ACCOMMODATION_OPTIONS, INTEREST_OPTIONS, LIMITS, TRANSPORT_OPTIONS } from "./trip-options";

const values = <T extends readonly { value: string }[]>(options: T) =>
  options.map((o) => o.value) as [T[number]["value"], ...T[number]["value"][]];

// Reject control characters (including CR/LF) in single-line fields so they can never reach email headers.
const SINGLE_LINE = /^[^\p{Cc}]*$/u;

const singleLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Please keep this under ${max} characters.` })
    .regex(SINGLE_LINE, { error: "Please remove line breaks and special characters." });

export const nameField = singleLine(100).min(2, { error: "Please enter your name." });

export const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .max(254, { error: "Please enter a shorter email address." })
  .pipe(z.email({ error: "Please enter a valid email address." }));

export const phoneField = z
  .string()
  .trim()
  .max(20, { error: "Please enter a valid phone number." })
  .regex(/^$|^\+?[0-9][0-9\s\-()]{6,18}$/, { error: "Please enter a valid phone number, e.g. +91 98765 43210." });

const multiLine = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Please keep this under ${max} characters.` })
    // Allow tabs and newlines; strip other control characters.
    .transform((v) => v.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ""));

/** Anti-spam fields present on every public form. */
export const antiSpamFields = {
  /** Honeypot: hidden from people, often filled by bots. Must be empty. */
  swzCheck: z.string().max(200).optional().default(""),
  /** Milliseconds since epoch when the form was rendered (time-trap). */
  startedAt: z.coerce.number().int().nonnegative().optional(),
  /** Random id generated once per form instance, for duplicate-submission protection. */
  submissionKey: z.uuid().optional(),
};

const consentField = z.literal(true, { error: "Please agree to the privacy notice so we can reply to you." });

// ─── Contact ─────────────────────────────────────────────────────────────────

export const contactSchema = z.object({
  name: nameField,
  email: emailField,
  phone: phoneField.optional().default(""),
  message: multiLine(4000).pipe(z.string().min(10, { error: "Please tell us a little more (at least 10 characters)." })),
  consent: consentField,
  ...antiSpamFields,
});
export type ContactInput = z.input<typeof contactSchema>;
export type ContactData = z.output<typeof contactSchema>;

// ─── Travel dates & travellers (shared) ──────────────────────────────────────

function travelDateRules(today: string) {
  const thisMonth = today.slice(0, 7);
  const lastMonth = addMonthsToMonth(thisMonth, LIMITS.maxAdvanceMonths);
  return z
    .object({
      dateMode: z.enum(["exact", "month"]),
      startDate: z.string().trim().optional().default(""),
      travelMonth: z.string().trim().optional().default(""),
    })
    .superRefine((val, ctx) => {
      if (val.dateMode === "exact") {
        if (!isIsoDate(val.startDate)) {
          ctx.addIssue({ code: "custom", path: ["startDate"], message: "Please choose your arrival date." });
        } else if (val.startDate < today) {
          ctx.addIssue({ code: "custom", path: ["startDate"], message: "The arrival date cannot be in the past." });
        } else if (val.startDate.slice(0, 7) > lastMonth) {
          ctx.addIssue({ code: "custom", path: ["startDate"], message: `Please choose a date within the next ${LIMITS.maxAdvanceMonths} months.` });
        }
      } else if (!isIsoMonth(val.travelMonth)) {
        ctx.addIssue({ code: "custom", path: ["travelMonth"], message: "Please choose the month you plan to travel." });
      } else if (val.travelMonth < thisMonth || val.travelMonth > lastMonth) {
        ctx.addIssue({ code: "custom", path: ["travelMonth"], message: `Please choose a month within the next ${LIMITS.maxAdvanceMonths} months.` });
      }
    });
}

const travellerFields = {
  adults: z.coerce
    .number({ error: "Please enter the number of adults." })
    .int()
    .min(1, { error: "At least one adult must travel." })
    .max(LIMITS.maxAdults, { error: `For groups larger than ${LIMITS.maxAdults} adults, please contact us directly.` }),
  children: z.coerce
    .number()
    .int()
    .min(0, { error: "Children cannot be negative." })
    .max(LIMITS.maxChildren, { error: `For more than ${LIMITS.maxChildren} children, please contact us directly.` }),
};

const preferenceFields = {
  accommodation: z.enum(values(ACCOMMODATION_OPTIONS)).default("no-preference"),
  transport: z.enum(values(TRANSPORT_OPTIONS)).default("no-preference"),
  interests: z.array(z.enum(values(INTEREST_OPTIONS))).max(INTEREST_OPTIONS.length).default([]),
  budget: singleLine(100).optional().default(""),
  promoCode: z
    .string()
    .trim()
    .toUpperCase()
    .max(30)
    .regex(/^[A-Z0-9-]*$/, { error: "Promo codes contain only letters, numbers and dashes." })
    .optional()
    .default(""),
};

const contactFields = {
  name: nameField,
  email: emailField,
  phone: phoneField.min(7, { error: "Please enter a phone number so we can reach you about your trip." }),
  message: multiLine(2000).optional().default(""),
  consent: consentField,
};

// ─── Custom trip ─────────────────────────────────────────────────────────────

export const tripLegSchema = z.object({
  destinationId: z.uuid({ error: "Please choose a destination." }),
  days: z.coerce
    .number({ error: "Please enter the number of days." })
    .int({ error: "Days must be a whole number." })
    .min(1, { error: "Stay at least one day." })
    .max(LIMITS.maxDaysPerLeg, { error: `Stays longer than ${LIMITS.maxDaysPerLeg} days need a custom quote.` }),
});

export const tripLegsSchema = z
  .array(tripLegSchema)
  .min(1, { error: "Add at least one destination." })
  .max(LIMITS.maxLegs, { error: `You can add up to ${LIMITS.maxLegs} destinations.` })
  .superRefine((legs, ctx) => {
    const total = legs.reduce((n, l) => n + l.days, 0);
    if (total > LIMITS.maxTotalDays) {
      ctx.addIssue({ code: "custom", message: `Trips longer than ${LIMITS.maxTotalDays} days need a custom quote — please contact us.` });
    }
  });

export function customTripSchema(today: string) {
  return z
    .object({
      legs: tripLegsSchema,
      ...travellerFields,
      ...preferenceFields,
      ...contactFields,
      ...antiSpamFields,
    })
    .and(travelDateRules(today));
}
export type CustomTripData = z.output<ReturnType<typeof customTripSchema>>;
export type CustomTripInput = z.input<ReturnType<typeof customTripSchema>>;

/** Subset used for live estimates (no contact details). */
export function tripEstimateSchema(today: string) {
  return z
    .object({
      legs: tripLegsSchema,
      ...travellerFields,
      promoCode: preferenceFields.promoCode,
    })
    .and(travelDateRules(today));
}
export type TripEstimateInput = z.input<ReturnType<typeof tripEstimateSchema>>;

// ─── Package enquiry ─────────────────────────────────────────────────────────

export function packageEnquirySchema(today: string) {
  return z
    .object({
      packageId: z.uuid(),
      addonIds: z.array(z.uuid()).max(20).default([]),
      ...travellerFields,
      accommodation: preferenceFields.accommodation,
      promoCode: preferenceFields.promoCode,
      ...contactFields,
      ...antiSpamFields,
    })
    .and(travelDateRules(today));
}
export type PackageEnquiryData = z.output<ReturnType<typeof packageEnquirySchema>>;

// ─── Enquiry status lookup ───────────────────────────────────────────────────

export const trackSchema = z.object({
  reference: z.string().trim().min(6).max(20),
  email: emailField,
});

/** Flatten zod issues into { "legs.0.days": "message" } for form display. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length ? issue.path.join(".") : "_form";
    out[key] ??= issue.message;
  }
  return out;
}
