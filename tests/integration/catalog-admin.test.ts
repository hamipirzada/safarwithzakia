import { beforeEach, describe, expect, it } from "vitest";
import { packageInput, destinationInput } from "@/domain/admin-schemas";
import { prisma } from "@/server/db";
import { loadPackageInput, saveDestination, savePackage, setDestinationStatus, setPackageStatus } from "@/server/catalog-admin";
import { changeEnquiryStatus } from "@/server/enquiries/admin";
import { getPackage, listPackages } from "@/server/catalog";
import { createDestination, resetDatabase } from "../support/db";

let actorId: string;
beforeEach(async () => {
  await resetDatabase();
  actorId = (await prisma.user.create({ data: { name: "Admin", email: "admin@example.test", role: "ADMIN" } })).id;
});

async function media() {
  return prisma.mediaAsset.create({ data: { path: `/images/test-${Math.random()}.jpg`, alt: "Test", width: 10, height: 10 } });
}

describe("package management", () => {
  it("creates a package with all related records in one transaction and reloads it for editing", async () => {
    const d1 = await createDestination("Srinagar");
    const d2 = await createDestination("Gulmarg");
    const image = await media();
    const data = packageInput.parse({
      title: "Kashmir Classic",
      slug: "kashmir-classic",
      summary: "Summary",
      description: "Description",
      durationDays: 4,
      durationNights: 3,
      heroImageId: image.id,
      galleryIds: [image.id],
      route: [{ destinationId: d1.id, days: 2 }, { destinationId: d2.id, days: 2 }],
      itinerary: [{ title: "Arrive", description: "Shikara ride" }, { title: "Gulmarg", description: "Gondola" }],
      included: ["Breakfast"],
      excluded: ["Flights"],
      pricingRules: [{ label: "Per person", basis: "PER_PERSON", amount: "12,000", childAmount: "6000", active: true }],
      addons: [{ name: "Pony ride", basis: "PER_PERSON", amount: "800", active: true }],
    });
    const id = await savePackage(null, data, actorId);
    const pkg = await prisma.package.findUniqueOrThrow({ where: { id }, include: { destinations: true, itinerary: true, features: true, pricingRules: true, addons: true, images: true } });
    expect(pkg).toMatchObject({ status: "DRAFT", durationDays: 4 });
    expect(pkg.destinations.map((d) => d.position)).toEqual([0, 1]);
    expect(pkg.itinerary.map((d) => d.dayNumber).sort()).toEqual([1, 2]);
    expect(pkg.features).toHaveLength(2);
    expect(pkg.pricingRules[0]).toMatchObject({ amountPaise: 12_000_00, childAmountPaise: 6000_00, basis: "PER_PERSON" });
    expect(await prisma.auditLog.count({ where: { action: "package.created", entityId: id } })).toBe(1);

    const loaded = await loadPackageInput(id);
    expect(loaded?.input).toMatchObject({ title: "Kashmir Classic", included: ["Breakfast"], pricingRules: [{ amount: "12000", childAmount: "6000" }] });
  });

  it("rolls back every change when part of a save fails", async () => {
    const d = await createDestination("Srinagar");
    const id = await savePackage(null, packageInput.parse({ title: "A", slug: "a", summary: "S", description: "D", durationDays: 2, durationNights: 1, route: [{ destinationId: d.id, days: 2 }], included: ["Original"] }), actorId);
    const bad = packageInput.parse({ title: "Changed", slug: "a", summary: "S", description: "D", durationDays: 2, durationNights: 1, route: [{ destinationId: "00000000-0000-4000-8000-000000000000", days: 2 }], included: ["New"] });
    await expect(savePackage(id, bad, actorId)).rejects.toThrow(/no longer exists/);
    const pkg = await prisma.package.findUniqueOrThrow({ where: { id }, include: { features: true } });
    expect(pkg.title).toBe("A");
    expect(pkg.features.map((f) => f.text)).toEqual(["Original"]);
  });

  it("only publishes complete packages whose destinations are live, and hides drafts from the site", async () => {
    const d = await createDestination("Pahalgam");
    const id = await savePackage(null, packageInput.parse({ title: "P", slug: "p", summary: "S", description: "D", durationDays: 1, durationNights: 0, route: [{ destinationId: d.id, days: 1 }] }), actorId);
    await expect(setPackageStatus(id, "PUBLISHED", actorId)).rejects.toThrow(/main image/);
    expect(await getPackage("p")).toBeNull();

    const image = await media();
    await prisma.package.update({ where: { id }, data: { heroImageId: image.id } });
    await prisma.destination.update({ where: { id: d.id }, data: { status: "DRAFT" } });
    await expect(setPackageStatus(id, "PUBLISHED", actorId)).rejects.toThrow(/Publish these destinations first/);

    await prisma.destination.update({ where: { id: d.id }, data: { status: "PUBLISHED" } });
    await setPackageStatus(id, "PUBLISHED", actorId);
    expect((await listPackages()).map((p) => p.slug)).toEqual(["p"]);
    await expect(setDestinationStatus(d.id, "ARCHIVED", actorId)).rejects.toThrow(/published package/);

    await setPackageStatus(id, "ARCHIVED", actorId);
    expect(await getPackage("p")).toBeNull();
  });

  it("rejects duplicate slugs", async () => {
    const d = await createDestination("Sonmarg");
    const data = packageInput.parse({ title: "S", slug: "same", summary: "S", description: "D", durationDays: 1, durationNights: 0, route: [{ destinationId: d.id, days: 1 }] });
    await savePackage(null, data, actorId);
    await expect(savePackage(null, data, actorId)).rejects.toMatchObject({ code: "P2002" });
  });
});

describe("destination management", () => {
  it("saves attractions, gallery and pricing rules", async () => {
    const image = await media();
    const id = await saveDestination(null, destinationInput.parse({ name: "Yusmarg", slug: "yusmarg", summary: "S", description: "D", heroImageId: image.id, galleryIds: [image.id], attractions: [{ name: "Meadow" }], pricingRules: [{ label: "Daily", basis: "PER_GROUP_PER_DAY", amount: "3000", active: false }] }), actorId);
    const d = await prisma.destination.findUniqueOrThrow({ where: { id }, include: { attractions: true, images: true, pricingRules: true } });
    expect(d).toMatchObject({ status: "DRAFT", attractions: [{ name: "Meadow" }], images: [{ mediaId: image.id }], pricingRules: [{ amountPaise: 3000_00, active: false }] });
  });

  it("enforces the single-owner pricing constraint in the database", async () => {
    const d = await createDestination("X");
    const pkg = await prisma.package.create({ data: { slug: "x", title: "X", summary: "S", description: "D", durationDays: 1, durationNights: 0 } });
    await expect(prisma.pricingRule.create({ data: { destinationId: d.id, packageId: pkg.id, label: "Both", basis: "PER_GROUP", amountPaise: 1 } })).rejects.toThrow();
  });
});

describe("enquiry status changes", () => {
  it("records valid transitions in history and the audit log, and rejects invalid ones", async () => {
    const enquiry = await prisma.enquiry.create({ data: { reference: "SWZ-2610-AAAAA", type: "CONTACT", customerName: "A", email: "a@example.test", snapshot: {}, consentAt: new Date() } });
    await changeEnquiryStatus(enquiry.id, "CONTACTED", "Called", actorId);
    await expect(changeEnquiryStatus(enquiry.id, "CONFIRMED", null, actorId)).rejects.toThrow(/cannot move/);
    const history = await prisma.enquiryStatusHistory.findMany({ where: { enquiryId: enquiry.id } });
    expect(history).toMatchObject([{ fromStatus: "NEW", toStatus: "CONTACTED", note: "Called", changedById: actorId }]);
    expect(await prisma.auditLog.count({ where: { action: "enquiry.status_changed" } })).toBe(1);
  });

  it("enforces that only consented testimonials can be published", async () => {
    await expect(prisma.testimonial.create({ data: { authorName: "A", quote: "Great trip!", status: "PUBLISHED", consentConfirmed: false } })).rejects.toThrow();
  });
});
