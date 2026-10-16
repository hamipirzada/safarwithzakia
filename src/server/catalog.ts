import "server-only";
import { cache } from "react";
import type { Prisma, PricingRule } from "@/generated/prisma/client";
import { utcDateToIsoDate } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import { BASIS_LABELS, lowestRate, type RateRule } from "@/domain/pricing";
import { prisma } from "./db";

/** Public catalogue queries. Only PUBLISHED records are ever returned here. */

export function toRateRule(rule: PricingRule): RateRule {
  return {
    id: rule.id,
    label: rule.label,
    basis: rule.basis,
    amountPaise: rule.amountPaise,
    childAmountPaise: rule.childAmountPaise,
    includedTravellers: rule.includedTravellers,
    seasonStart: rule.seasonStart,
    seasonEnd: rule.seasonEnd,
    validFrom: rule.validFrom ? utcDateToIsoDate(rule.validFrom) : null,
    validTo: rule.validTo ? utcDateToIsoDate(rule.validTo) : null,
  };
}

/** "From ₹3,500 per person, per day", or null when no single comparable published rate exists. */
export function fromPriceLabel(rules: readonly RateRule[]): string | null {
  const lowest = lowestRate(rules);
  if (!lowest) return null;
  const basis =
    lowest.basis === "PER_PACKAGE" && lowest.includedTravellers
      ? `for ${lowest.includedTravellers} traveller${lowest.includedTravellers === 1 ? "" : "s"}`
      : BASIS_LABELS[lowest.basis];
  return `From ${formatINR(lowest.amountPaise)} ${basis}`;
}

const activeRules = { where: { active: true }, orderBy: { amountPaise: "asc" } } satisfies Prisma.Destination$pricingRulesArgs;

export async function listDestinations() {
  const rows = await prisma.destination.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    include: { heroImage: true, pricingRules: activeRules, attractions: { orderBy: { position: "asc" }, take: 4 } },
  });
  return rows.map((d) => ({ ...d, rateRules: d.pricingRules.map(toRateRule), priceLabel: fromPriceLabel(d.pricingRules.map(toRateRule)) }));
}

export const getDestination = cache(async (slug: string) => {
  const d = await prisma.destination.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      heroImage: true,
      images: { orderBy: { position: "asc" }, include: { media: true } },
      attractions: { orderBy: { position: "asc" } },
      pricingRules: activeRules,
      packages: {
        where: { package: { status: "PUBLISHED" } },
        include: { package: { include: { heroImage: true, pricingRules: { where: { active: true } } } } },
      },
    },
  });
  if (!d) return null;
  const rateRules = d.pricingRules.map(toRateRule);
  const seen = new Set<string>();
  const relatedPackages = d.packages
    .map((pd) => pd.package)
    .filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)))
    .map((p) => ({ ...p, priceLabel: fromPriceLabel(p.pricingRules.map(toRateRule)) }));
  return { ...d, rateRules, priceLabel: fromPriceLabel(rateRules), relatedPackages };
});

/** Destinations offered in the trip builder, with their active rates. */
export async function listTripBuilderDestinations() {
  const rows = await prisma.destination.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: { id: true, slug: true, name: true, summary: true, recommendedDuration: true, heroImage: true, pricingRules: activeRules },
  });
  return rows.map((d) => {
    const rateRules = d.pricingRules.map(toRateRule);
    return { id: d.id, slug: d.slug, name: d.name, summary: d.summary, recommendedDuration: d.recommendedDuration, heroImage: d.heroImage, rateRules, priceLabel: fromPriceLabel(rateRules) };
  });
}

const packageListInclude = {
  heroImage: true,
  pricingRules: { where: { active: true }, orderBy: { amountPaise: "asc" } },
  destinations: { orderBy: { position: "asc" }, include: { destination: { select: { name: true, slug: true, status: true } } } },
} satisfies Prisma.PackageInclude;

export async function listPackages(options: { featuredOnly?: boolean; take?: number } = {}) {
  const rows = await prisma.package.findMany({
    where: { status: "PUBLISHED", ...(options.featuredOnly ? { featured: true } : {}) },
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }, { title: "asc" }],
    take: options.take,
    include: packageListInclude,
  });
  return rows.map((p) => ({ ...p, priceLabel: fromPriceLabel(p.pricingRules.map(toRateRule)) }));
}

export const getPackage = cache(async (slug: string) => {
  const p = await prisma.package.findFirst({
    where: { slug, status: "PUBLISHED" },
    include: {
      ...packageListInclude,
      itinerary: { orderBy: { dayNumber: "asc" } },
      images: { orderBy: { position: "asc" }, include: { media: true } },
      features: { orderBy: { position: "asc" } },
      addons: { where: { active: true }, orderBy: { position: "asc" } },
    },
  });
  if (!p) return null;
  const rateRules = p.pricingRules.map(toRateRule);
  const destinationIds = p.destinations.map((d) => d.destinationId);
  const related = await prisma.package.findMany({
    where: { status: "PUBLISHED", id: { not: p.id }, destinations: { some: { destinationId: { in: destinationIds } } } },
    take: 3,
    orderBy: [{ featured: "desc" }, { sortOrder: "asc" }],
    include: packageListInclude,
  });
  return {
    ...p,
    rateRules,
    priceLabel: fromPriceLabel(rateRules),
    related: related.map((r) => ({ ...r, priceLabel: fromPriceLabel(r.pricingRules.map(toRateRule)) })),
  };
});

export async function listActiveOffers(now = new Date()) {
  return prisma.offer.findMany({
    where: {
      status: "PUBLISHED",
      AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: now } }] }, { OR: [{ validTo: null }, { validTo: { gte: now } }] }],
    },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
    include: {
      package: { select: { slug: true, title: true, status: true } },
      promoCode: { select: { code: true, active: true, validFrom: true, validTo: true } },
    },
  }).then((offers) =>
    offers.map(({ promoCode, ...offer }) => ({
      ...offer,
      // Only advertise a code the pricing engine would currently accept.
      promoCode:
        promoCode && promoCode.active && (!promoCode.validFrom || promoCode.validFrom <= now) && (!promoCode.validTo || promoCode.validTo >= now)
          ? { code: promoCode.code }
          : null,
    })),
  );
}

export async function listTestimonials() {
  // The database also enforces that PUBLISHED implies consentConfirmed.
  return prisma.testimonial.findMany({
    where: { status: "PUBLISHED", consentConfirmed: true },
    orderBy: [{ sortOrder: "asc" }, { createdAt: "desc" }],
  });
}

export async function listFaqs() {
  return prisma.faq.findMany({ where: { status: "PUBLISHED" }, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] });
}

/** Cards for the home hero ring: each destination's hero plus gallery photos, up to 8 cards. */
export async function listHeroRingItems(max = 8) {
  const destinations = await prisma.destination.findMany({
    where: { status: "PUBLISHED" },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    select: {
      slug: true,
      name: true,
      heroImage: true,
      images: { orderBy: { position: "asc" }, include: { media: true } },
    },
  });
  const perDestination = destinations.map((d) => [d.heroImage, ...d.images.map((i) => i.media)].filter((m) => m !== null).map((media) => ({ destination: d, media })));
  // Interleave so neighbouring cards show different places.
  const items: { key: string; href: string; title: string; caption: string; image: { path: string; alt: string } }[] = [];
  for (let round = 0; items.length < max; round++) {
    let added = false;
    for (const list of perDestination) {
      const entry = list[round];
      if (!entry || items.length >= max) continue;
      added = true;
      items.push({
        key: `${entry.destination.slug}-${entry.media.id}`,
        href: `/destinations/${entry.destination.slug}`,
        title: entry.destination.name,
        caption: entry.media.alt,
        image: { path: entry.media.path, alt: entry.media.alt },
      });
    }
    if (!added) break;
  }
  return items;
}
