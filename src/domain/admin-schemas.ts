/**
 * Validation for catalogue editing in the admin. Shared by the editors (inline errors) and the
 * server actions (authoritative). Money is entered in rupees and converted to paise here.
 */

import { z } from "zod";

// No runtime code generation: keeps validation compatible with the strict Content-Security-Policy.
z.config({ jitless: true });
import { isIsoDate } from "./dates";
import { parseRupeesToPaise } from "./money";
import { isValidSlug } from "./slug";

const text = (max: number) => z.string().trim().max(max, { error: `Keep this under ${max} characters.` });
const required = (max: number, label: string) => text(max).min(1, { error: `${label} is required.` });
const optional = (max: number) =>
  text(max)
    .optional()
    .transform((v) => (v ? v : null));

const rupees = (label: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const paise = parseRupeesToPaise(String(v));
    if (paise === null) {
      ctx.addIssue({ code: "custom", message: `${label}: enter an amount in rupees, e.g. 3500.` });
      return z.NEVER;
    }
    return paise;
  });

const optionalRupees = (label: string) =>
  z
    .union([z.string(), z.number(), z.null()])
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined || String(v).trim() === "") return null;
      const paise = parseRupeesToPaise(String(v));
      if (paise === null) {
        ctx.addIssue({ code: "custom", message: `${label}: enter an amount in rupees.` });
        return z.NEVER;
      }
      return paise;
    });

const monthDay = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/.test(v), { error: "Use MM-DD, e.g. 12-15." });

const isoDate = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || isIsoDate(v), { error: "Use a valid date." });

export const slugField = z
  .string()
  .trim()
  .toLowerCase()
  .refine(isValidSlug, { error: "Use lowercase letters, numbers and dashes only (e.g. kashmir-honeymoon)." });

export const PRICING_BASES = ["PER_PERSON", "PER_GROUP", "PER_PERSON_PER_DAY", "PER_GROUP_PER_DAY", "PER_PACKAGE"] as const;
export const PUBLICATION_STATUSES = ["DRAFT", "PUBLISHED", "ARCHIVED"] as const;

export const pricingRuleInput = z
  .object({
    label: required(80, "Label"),
    basis: z.enum(PRICING_BASES),
    amount: rupees("Amount"),
    childAmount: optionalRupees("Child amount"),
    includedTravellers: z
      .union([z.string(), z.number(), z.null()])
      .optional()
      .transform((v) => (v === null || v === undefined || String(v).trim() === "" ? null : Number(v)))
      .refine((v) => v === null || (Number.isInteger(v) && v > 0 && v <= 50), { error: "Enter a whole number of travellers." }),
    seasonStart: monthDay,
    seasonEnd: monthDay,
    validFrom: isoDate,
    validTo: isoDate,
    active: z.boolean(),
    notes: optional(500),
  })
  .superRefine((r, ctx) => {
    if ((r.seasonStart === null) !== (r.seasonEnd === null)) ctx.addIssue({ code: "custom", path: ["seasonEnd"], message: "Give both a season start and end, or neither." });
    if (r.basis === "PER_PACKAGE" && r.includedTravellers === null) ctx.addIssue({ code: "custom", path: ["includedTravellers"], message: "A package price must say how many travellers it covers." });
    if (r.validFrom && r.validTo && r.validFrom > r.validTo) ctx.addIssue({ code: "custom", path: ["validTo"], message: "The end date is before the start date." });
  });
export type PricingRuleInput = z.input<typeof pricingRuleInput>;

const destinationRuleInput = pricingRuleInput.refine((r) => r.basis !== "PER_PACKAGE", {
  error: "Destination rates cannot use the per-package basis.",
  path: ["basis"],
});

const mediaId = z.uuid({ error: "Choose an image." });

export const destinationInput = z.object({
  name: required(100, "Name"),
  slug: slugField,
  region: optional(80),
  summary: required(300, "Summary"),
  description: required(6000, "Description"),
  bestSeason: optional(200),
  recommendedDuration: optional(100),
  travelTips: optional(3000),
  heroImageId: z.union([z.literal(""), z.null(), mediaId]).optional().transform((v) => v || null),
  galleryIds: z.array(mediaId).max(12).default([]),
  attractions: z.array(z.object({ name: required(100, "Attraction"), description: optional(500) })).max(30).default([]),
  pricingRules: z.array(destinationRuleInput).max(20).default([]),
  sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
  seoTitle: optional(70),
  seoDescription: optional(160),
});
export type DestinationInput = z.input<typeof destinationInput>;
export type DestinationData = z.output<typeof destinationInput>;

export const packageInput = z
  .object({
    title: required(120, "Title"),
    slug: slugField,
    category: optional(60),
    summary: required(300, "Summary"),
    description: required(8000, "Description"),
    durationDays: z.coerce.number().int().min(1, { error: "At least 1 day." }).max(60),
    durationNights: z.coerce.number().int().min(0).max(60),
    idealFor: optional(80),
    accommodationInfo: optional(3000),
    transportInfo: optional(3000),
    availabilityNotes: optional(2000),
    cancellationPolicy: optional(4000),
    heroImageId: z.union([z.literal(""), z.null(), mediaId]).optional().transform((v) => v || null),
    galleryIds: z.array(mediaId).max(12).default([]),
    featured: z.boolean().default(false),
    sortOrder: z.coerce.number().int().min(0).max(9999).default(0),
    seoTitle: optional(70),
    seoDescription: optional(160),
    route: z.array(z.object({ destinationId: z.uuid({ error: "Choose a destination." }), days: z.coerce.number().int().min(1).max(30) })).max(15).default([]),
    itinerary: z.array(z.object({ title: required(120, "Day title"), description: required(3000, "Day description"), overnight: optional(120) })).max(60).default([]),
    included: z.array(required(300, "Item")).max(40).default([]),
    excluded: z.array(required(300, "Item")).max(40).default([]),
    pricingRules: z.array(pricingRuleInput).max(20).default([]),
    addons: z
      .array(z.object({ name: required(100, "Add-on name"), description: optional(300), basis: z.enum(PRICING_BASES), amount: rupees("Add-on amount"), active: z.boolean() }))
      .max(20)
      .default([]),
  })
  .superRefine((p, ctx) => {
    if (p.durationNights > p.durationDays) ctx.addIssue({ code: "custom", path: ["durationNights"], message: "Nights cannot exceed days." });
    const routeDays = p.route.reduce((n, r) => n + r.days, 0);
    if (p.route.length > 0 && routeDays !== p.durationDays) {
      ctx.addIssue({ code: "custom", path: ["route"], message: `The route adds up to ${routeDays} days but the package is ${p.durationDays} days.` });
    }
  });
export type PackageInput = z.input<typeof packageInput>;
export type PackageData = z.output<typeof packageInput>;

/** What must be present before something can be published. */
export function publishProblems(entity: { summary: string; description: string; heroImageId: string | null }, extra: string[] = []): string[] {
  const problems = [...extra];
  if (!entity.summary) problems.push("a summary");
  if (!entity.description) problems.push("a description");
  if (!entity.heroImageId) problems.push("a main image");
  return problems;
}

// Blank records for the "new" editors. Kept here (not in the client editor files) so server pages can call them.
export const emptyPackage = (): PackageInput => ({
  title: "",
  slug: "",
  category: "",
  summary: "",
  description: "",
  durationDays: 5,
  durationNights: 4,
  idealFor: "",
  accommodationInfo: "",
  transportInfo: "",
  availabilityNotes: "",
  cancellationPolicy: "",
  heroImageId: "",
  galleryIds: [],
  featured: false,
  sortOrder: 0,
  seoTitle: "",
  seoDescription: "",
  route: [],
  itinerary: [],
  included: [],
  excluded: [],
  pricingRules: [],
  addons: [],
});

export const emptyDestination = (): DestinationInput => ({
  name: "",
  slug: "",
  region: "",
  summary: "",
  description: "",
  bestSeason: "",
  recommendedDuration: "",
  travelTips: "",
  heroImageId: "",
  galleryIds: [],
  attractions: [],
  pricingRules: [],
  sortOrder: 0,
  seoTitle: "",
  seoDescription: "",
});
