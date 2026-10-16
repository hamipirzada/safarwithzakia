import "server-only";
import type { PricingRule, PublicationStatus } from "@/generated/prisma/client";
import type { DestinationData, DestinationInput, PackageData, PackageInput } from "@/domain/admin-schemas";
import { publishProblems } from "@/domain/admin-schemas";
import { isoDateToUtcDate, utcDateToIsoDate } from "@/domain/dates";
import { paiseToRupeeInput } from "@/domain/money";
import { UserFacingError } from "./admin/action";
import { audit } from "./audit";
import { prisma, type Tx } from "./db";

type RuleData = DestinationData["pricingRules"][number];

function ruleRow(rule: RuleData) {
  return {
    label: rule.label,
    basis: rule.basis,
    amountPaise: rule.amount,
    childAmountPaise: rule.childAmount,
    includedTravellers: rule.includedTravellers,
    seasonStart: rule.seasonStart,
    seasonEnd: rule.seasonEnd,
    validFrom: rule.validFrom ? isoDateToUtcDate(rule.validFrom) : null,
    validTo: rule.validTo ? isoDateToUtcDate(rule.validTo) : null,
    active: rule.active,
    notes: rule.notes,
  };
}

export function ruleToInput(rule: PricingRule) {
  return {
    label: rule.label,
    basis: rule.basis,
    amount: paiseToRupeeInput(rule.amountPaise),
    childAmount: rule.childAmountPaise === null ? "" : paiseToRupeeInput(rule.childAmountPaise),
    includedTravellers: rule.includedTravellers === null ? "" : String(rule.includedTravellers),
    seasonStart: rule.seasonStart ?? "",
    seasonEnd: rule.seasonEnd ?? "",
    validFrom: rule.validFrom ? utcDateToIsoDate(rule.validFrom) : "",
    validTo: rule.validTo ? utcDateToIsoDate(rule.validTo) : "",
    active: rule.active,
    notes: rule.notes ?? "",
  };
}

async function assertMediaExists(tx: Tx, ids: (string | null)[]): Promise<void> {
  const wanted = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (wanted.length === 0) return;
  const found = await tx.mediaAsset.count({ where: { id: { in: wanted } } });
  if (found !== wanted.length) throw new UserFacingError("One of the selected images no longer exists.");
}

// ─── Destinations ────────────────────────────────────────────────────────────

export async function saveDestination(id: string | null, data: DestinationData, actorId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await assertMediaExists(tx, [data.heroImageId, ...data.galleryIds]);
    const fields = {
      name: data.name,
      slug: data.slug,
      region: data.region,
      summary: data.summary,
      description: data.description,
      bestSeason: data.bestSeason,
      recommendedDuration: data.recommendedDuration,
      travelTips: data.travelTips,
      heroImageId: data.heroImageId,
      sortOrder: data.sortOrder,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    };
    const destination = id ? await tx.destination.update({ where: { id }, data: fields }) : await tx.destination.create({ data: { ...fields, status: "DRAFT" } });

    if (destination.status === "PUBLISHED" && publishProblems(destination).length) {
      throw new UserFacingError(`A published destination needs ${publishProblems(destination).join(", ")}.`);
    }

    await tx.attraction.deleteMany({ where: { destinationId: destination.id } });
    await tx.attraction.createMany({ data: data.attractions.map((a, position) => ({ destinationId: destination.id, name: a.name, description: a.description, position })) });
    await tx.destinationImage.deleteMany({ where: { destinationId: destination.id } });
    await tx.destinationImage.createMany({ data: [...new Set(data.galleryIds)].map((mediaId, position) => ({ destinationId: destination.id, mediaId, position })) });
    await tx.pricingRule.deleteMany({ where: { destinationId: destination.id } });
    await tx.pricingRule.createMany({ data: data.pricingRules.map((r) => ({ ...ruleRow(r), destinationId: destination.id })) });

    await audit({ actorId, action: id ? "destination.updated" : "destination.created", entityType: "Destination", entityId: destination.id, metadata: { slug: destination.slug } }, tx);
    return destination.id;
  });
}

export async function loadDestinationInput(id: string): Promise<{ status: PublicationStatus; version: string; input: DestinationInput } | null> {
  const d = await prisma.destination.findUnique({
    where: { id },
    include: { attractions: { orderBy: { position: "asc" } }, images: { orderBy: { position: "asc" } }, pricingRules: { orderBy: [{ amountPaise: "asc" }, { label: "asc" }] } },
  });
  if (!d) return null;
  return {
    status: d.status,
    version: d.updatedAt.toISOString(),
    input: {
      name: d.name,
      slug: d.slug,
      region: d.region ?? "",
      summary: d.summary,
      description: d.description,
      bestSeason: d.bestSeason ?? "",
      recommendedDuration: d.recommendedDuration ?? "",
      travelTips: d.travelTips ?? "",
      heroImageId: d.heroImageId ?? "",
      galleryIds: d.images.map((i) => i.mediaId),
      attractions: d.attractions.map((a) => ({ name: a.name, description: a.description ?? "" })),
      pricingRules: d.pricingRules.map(ruleToInput),
      sortOrder: d.sortOrder,
      seoTitle: d.seoTitle ?? "",
      seoDescription: d.seoDescription ?? "",
    },
  };
}

export async function setDestinationStatus(id: string, status: PublicationStatus, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const d = await tx.destination.findUnique({ where: { id } });
    if (!d) throw new UserFacingError("This destination no longer exists.");
    if (status === "PUBLISHED") {
      const problems = publishProblems(d);
      if (problems.length) throw new UserFacingError(`Add ${problems.join(", ")} before publishing.`);
    }
    if (status !== "PUBLISHED") {
      const live = await tx.packageDestination.count({ where: { destinationId: id, package: { status: "PUBLISHED" } } });
      if (live > 0) throw new UserFacingError(`This destination is part of ${live} published package${live === 1 ? "" : "s"}. Unpublish or change those packages first.`);
    }
    await tx.destination.update({ where: { id }, data: { status } });
    await audit({ actorId, action: `destination.${status.toLowerCase()}`, entityType: "Destination", entityId: id }, tx);
  });
}

// ─── Packages ────────────────────────────────────────────────────────────────

export async function savePackage(id: string | null, data: PackageData, actorId: string): Promise<string> {
  return prisma.$transaction(async (tx) => {
    await assertMediaExists(tx, [data.heroImageId, ...data.galleryIds]);
    const destinationIds = [...new Set(data.route.map((r) => r.destinationId))];
    if (destinationIds.length) {
      const found = await tx.destination.count({ where: { id: { in: destinationIds } } });
      if (found !== destinationIds.length) throw new UserFacingError("One of the route destinations no longer exists.");
    }

    const fields = {
      title: data.title,
      slug: data.slug,
      category: data.category,
      summary: data.summary,
      description: data.description,
      durationDays: data.durationDays,
      durationNights: data.durationNights,
      idealFor: data.idealFor,
      accommodationInfo: data.accommodationInfo,
      transportInfo: data.transportInfo,
      availabilityNotes: data.availabilityNotes,
      cancellationPolicy: data.cancellationPolicy,
      heroImageId: data.heroImageId,
      featured: data.featured,
      sortOrder: data.sortOrder,
      seoTitle: data.seoTitle,
      seoDescription: data.seoDescription,
    };
    const pkg = id ? await tx.package.update({ where: { id }, data: fields }) : await tx.package.create({ data: { ...fields, status: "DRAFT" } });
    if (pkg.status === "PUBLISHED") {
      const problems = publishProblems(pkg, data.route.length === 0 ? ["at least one route destination"] : []);
      if (problems.length) throw new UserFacingError(`A published package needs ${problems.join(", ")}.`);
      // A live package may only route through live destinations (otherwise stops vanish publicly).
      const hidden = await tx.destination.findMany({ where: { id: { in: destinationIds }, status: { not: "PUBLISHED" } }, select: { name: true } });
      if (hidden.length) throw new UserFacingError(`Publish these destinations before adding them to a published package: ${hidden.map((d) => d.name).join(", ")}.`);
    }

    // Replace child collections as one unit so a package is never half-updated.
    await tx.packageDestination.deleteMany({ where: { packageId: pkg.id } });
    await tx.packageDestination.createMany({ data: data.route.map((r, position) => ({ packageId: pkg.id, destinationId: r.destinationId, days: r.days, position })) });
    await tx.itineraryDay.deleteMany({ where: { packageId: pkg.id } });
    await tx.itineraryDay.createMany({ data: data.itinerary.map((d, index) => ({ packageId: pkg.id, dayNumber: index + 1, title: d.title, description: d.description, overnight: d.overnight })) });
    await tx.packageFeature.deleteMany({ where: { packageId: pkg.id } });
    await tx.packageFeature.createMany({
      data: [
        ...data.included.map((text, position) => ({ packageId: pkg.id, kind: "INCLUDED" as const, text, position })),
        ...data.excluded.map((text, position) => ({ packageId: pkg.id, kind: "EXCLUDED" as const, text, position })),
      ],
    });
    await tx.packageImage.deleteMany({ where: { packageId: pkg.id } });
    await tx.packageImage.createMany({ data: [...new Set(data.galleryIds)].map((mediaId, position) => ({ packageId: pkg.id, mediaId, position })) });
    await tx.pricingRule.deleteMany({ where: { packageId: pkg.id } });
    await tx.pricingRule.createMany({ data: data.pricingRules.map((r) => ({ ...ruleRow(r), packageId: pkg.id })) });
    await tx.packageAddon.deleteMany({ where: { packageId: pkg.id } });
    await tx.packageAddon.createMany({
      data: data.addons.map((a, position) => ({ packageId: pkg.id, name: a.name, description: a.description, basis: a.basis, amountPaise: a.amount, active: a.active, position })),
    });

    await audit({ actorId, action: id ? "package.updated" : "package.created", entityType: "Package", entityId: pkg.id, metadata: { slug: pkg.slug } }, tx);
    return pkg.id;
  });
}

export async function loadPackageInput(id: string): Promise<{ status: PublicationStatus; version: string; input: PackageInput } | null> {
  const p = await prisma.package.findUnique({
    where: { id },
    include: {
      destinations: { orderBy: { position: "asc" } },
      itinerary: { orderBy: { dayNumber: "asc" } },
      features: { orderBy: { position: "asc" } },
      images: { orderBy: { position: "asc" } },
      pricingRules: { orderBy: [{ amountPaise: "asc" }, { label: "asc" }] },
      addons: { orderBy: { position: "asc" } },
    },
  });
  if (!p) return null;
  return {
    status: p.status,
    version: p.updatedAt.toISOString(),
    input: {
      title: p.title,
      slug: p.slug,
      category: p.category ?? "",
      summary: p.summary,
      description: p.description,
      durationDays: p.durationDays,
      durationNights: p.durationNights,
      idealFor: p.idealFor ?? "",
      accommodationInfo: p.accommodationInfo ?? "",
      transportInfo: p.transportInfo ?? "",
      availabilityNotes: p.availabilityNotes ?? "",
      cancellationPolicy: p.cancellationPolicy ?? "",
      heroImageId: p.heroImageId ?? "",
      galleryIds: p.images.map((i) => i.mediaId),
      featured: p.featured,
      sortOrder: p.sortOrder,
      seoTitle: p.seoTitle ?? "",
      seoDescription: p.seoDescription ?? "",
      route: p.destinations.map((d) => ({ destinationId: d.destinationId, days: d.days })),
      itinerary: p.itinerary.map((d) => ({ title: d.title, description: d.description, overnight: d.overnight ?? "" })),
      included: p.features.filter((f) => f.kind === "INCLUDED").map((f) => f.text),
      excluded: p.features.filter((f) => f.kind === "EXCLUDED").map((f) => f.text),
      pricingRules: p.pricingRules.map(ruleToInput),
      addons: p.addons.map((a) => ({ name: a.name, description: a.description ?? "", basis: a.basis, amount: paiseToRupeeInput(a.amountPaise), active: a.active })),
    },
  };
}

export async function setPackageStatus(id: string, status: PublicationStatus, actorId: string): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const p = await tx.package.findUnique({ where: { id }, include: { destinations: { include: { destination: { select: { status: true, name: true } } } } } });
    if (!p) throw new UserFacingError("This package no longer exists.");
    if (status === "PUBLISHED") {
      const unpublished = p.destinations.filter((d) => d.destination.status !== "PUBLISHED").map((d) => d.destination.name);
      const problems = publishProblems(p, p.destinations.length === 0 ? ["at least one route destination"] : []);
      if (problems.length) throw new UserFacingError(`Add ${problems.join(", ")} before publishing.`);
      if (unpublished.length) throw new UserFacingError(`Publish these destinations first: ${unpublished.join(", ")}.`);
    }
    await tx.package.update({ where: { id }, data: { status, publishedAt: status === "PUBLISHED" ? (p.publishedAt ?? new Date()) : p.publishedAt } });
    await audit({ actorId, action: `package.${status.toLowerCase()}`, entityType: "Package", entityId: id }, tx);
  });
}
