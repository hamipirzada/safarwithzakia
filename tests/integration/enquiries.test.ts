import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { previewTripEstimate, submitContact, submitCustomTrip, submitPackageEnquiry } from "@/server/enquiries/submit";
import { createDestination, resetDatabase } from "../support/db";

const NOW = new Date("2026-10-16T06:00:00Z");
const ctx = (ip = "ip-hash-1") => ({ ipHash: ip, sourcePage: "/contact", now: NOW });
const oldEnough = NOW.getTime() - 60_000; // form rendered a minute earlier

function contact(overrides: Record<string, unknown> = {}) {
  return { name: "Asha Rao", email: "asha@example.com", phone: "", message: "We would like to visit Kashmir in May.", consent: true, startedAt: oldEnough, ...overrides };
}

function trip(destinationId: string, overrides: Record<string, unknown> = {}) {
  return {
    legs: [{ destinationId, days: 2 }],
    dateMode: "exact",
    startDate: "2026-11-10",
    adults: 2,
    children: 0,
    accommodation: "deluxe",
    transport: "suv",
    interests: ["snow"],
    name: "Asha Rao",
    email: "asha@example.com",
    phone: "+91 98765 43210",
    consent: true,
    startedAt: oldEnough,
    ...overrides,
  };
}

beforeEach(resetDatabase);

describe("contact enquiries", () => {
  it("saves the enquiry, its history and both outbox emails in one go", async () => {
    const result = await submitContact(contact(), ctx());
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const enquiry = await prisma.enquiry.findUniqueOrThrow({ where: { reference: result.reference }, include: { statusHistory: true, emails: true } });
    expect(enquiry).toMatchObject({ type: "CONTACT", status: "NEW", customerName: "Asha Rao", email: "asha@example.com", phone: null, ipHash: "ip-hash-1", estimateStatus: "NOT_APPLICABLE" });
    expect(enquiry.statusHistory).toHaveLength(1);
    expect(enquiry.emails.map((e) => e.kind).sort()).toEqual(["CUSTOMER_ACKNOWLEDGEMENT", "INTERNAL_NOTIFICATION"]);
    const internal = enquiry.emails.find((e) => e.kind === "INTERNAL_NOTIFICATION")!;
    expect(internal).toMatchObject({ status: "PENDING", toAddress: "", replyTo: "asha@example.com", idempotencyKey: `enquiry:${enquiry.id}:internal` });
    expect(internal.text).toContain(result.reference);
    const snapshot = enquiry.snapshot as { submitted: Record<string, unknown> };
    expect(snapshot.submitted).not.toHaveProperty("consent");
    expect(snapshot.submitted).not.toHaveProperty("swzCheck");
  });

  it("does not create anything for invalid input", async () => {
    const result = await submitContact(contact({ email: "not-an-email", consent: false }), ctx());
    expect(result).toMatchObject({ ok: false, error: "VALIDATION" });
    expect(await prisma.enquiry.count()).toBe(0);
  });

  it("stores honeypot and too-fast submissions as spam without sending email", async () => {
    const honeypot = await submitContact(contact({ swzCheck: "http://spam.example" }), ctx("a"));
    const tooFast = await submitContact(contact({ email: "b@example.com", startedAt: NOW.getTime() - 500 }), ctx("b"));
    expect(honeypot.ok && tooFast.ok).toBe(true);
    expect(await prisma.enquiry.count({ where: { status: "SPAM" } })).toBe(2);
    expect(await prisma.emailDelivery.count()).toBe(0);
  });

  it("returns the same reference when the same form is submitted twice", async () => {
    const submissionKey = "6f1c6a8e-4b8f-4c55-9d43-3f0c4b6e2a11";
    const first = await submitContact(contact({ submissionKey }), ctx());
    const second = await submitContact(contact({ submissionKey }), ctx());
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) expect(second.reference).toBe(first.reference);
    expect(await prisma.enquiry.count()).toBe(1);
    expect(await prisma.emailDelivery.count()).toBe(2);
  });

  it("rate-limits repeated submissions from one IP and one email", async () => {
    for (let i = 0; i < 5; i++) expect((await submitContact(contact({ email: `p${i}@example.com` }), ctx("same-ip"))).ok).toBe(true);
    expect(await submitContact(contact({ email: "p6@example.com" }), ctx("same-ip"))).toMatchObject({ ok: false, error: "RATE_LIMITED" });

    for (let i = 0; i < 5; i++) expect((await submitContact(contact({ email: "same@example.com" }), ctx(`ip-${i}`))).ok).toBe(true);
    expect(await submitContact(contact({ email: "same@example.com" }), ctx("ip-new"))).toMatchObject({ ok: false, error: "RATE_LIMITED" });
  });

  it("skips the IP limit (but keeps the email limit) when no client IP is known", async () => {
    for (let i = 0; i < 7; i++) expect((await submitContact(contact({ email: `n${i}@example.com` }), { ipHash: null, sourcePage: null, now: NOW })).ok).toBe(true);
  });

  it("does not queue a customer acknowledgement when that is switched off", async () => {
    await prisma.siteSetting.create({ data: { key: "email", value: { recipientEmail: "", sendCustomerAcknowledgement: false } } });
    const result = await submitContact(contact(), ctx());
    expect(result.ok).toBe(true);
    expect(await prisma.emailDelivery.findMany({ select: { kind: true } })).toEqual([{ kind: "INTERNAL_NOTIFICATION" }]);
  });
});

describe("custom trips", () => {
  it("re-prices on the server from active database rates", async () => {
    const gulmarg = await createDestination("Gulmarg", { rate: { basis: "PER_PERSON_PER_DAY", amountPaise: 4500_00 } });
    // Client-supplied price fields are ignored entirely.
    const result = await submitCustomTrip({ ...trip(gulmarg.id), estimateTotalPaise: 1, totalPaise: 1 }, ctx());
    expect(result).toMatchObject({ ok: true, estimate: { kind: "ESTIMATED", totalPaise: 2 * 2 * 4500_00 } });
    const enquiry = await prisma.enquiry.findFirstOrThrow({ include: { destinations: true } });
    expect(enquiry).toMatchObject({ type: "CUSTOM_TRIP", estimateStatus: "ESTIMATED", estimateTotalPaise: 18000_00, durationDays: 2, adults: 2, travelMonth: "2026-11" });
    expect(enquiry.destinations).toMatchObject([{ destinationId: gulmarg.id, nameSnapshot: "Gulmarg", days: 2, position: 0 }]);
  });

  it("records QUOTE_REQUIRED when a rate is inactive (unconfirmed)", async () => {
    const sonmarg = await createDestination("Sonmarg", { rate: { basis: "PER_PERSON_PER_DAY", amountPaise: 6000_00, active: false } });
    const result = await submitCustomTrip(trip(sonmarg.id), ctx());
    expect(result).toMatchObject({ ok: true, estimate: { kind: "QUOTE_REQUIRED" } });
    expect(await prisma.enquiry.findFirstOrThrow()).toMatchObject({ estimateStatus: "QUOTE_REQUIRED", estimateTotalPaise: null });
  });

  it("applies promo codes from the database", async () => {
    const d = await createDestination("Pahalgam", { rate: { basis: "PER_GROUP_PER_DAY", amountPaise: 5000_00 } });
    await prisma.promoCode.create({ data: { code: "WINTER10", discountType: "PERCENT", value: 10 } });
    const result = await previewTripEstimate({ legs: [{ destinationId: d.id, days: 2 }], dateMode: "exact", startDate: "2026-11-10", adults: 2, children: 0, promoCode: "winter10" }, { ipHash: "x", now: NOW });
    expect(result).toMatchObject({ ok: true, estimate: { kind: "ESTIMATED", subtotalPaise: 10000_00, totalPaise: 9000_00 } });
  });

  it("rejects unpublished destinations", async () => {
    const hidden = await createDestination("Hidden");
    await prisma.destination.update({ where: { id: hidden.id }, data: { status: "DRAFT" } });
    expect(await submitCustomTrip(trip(hidden.id), ctx())).toMatchObject({ ok: false, error: "VALIDATION", fieldErrors: { "legs.0.destinationId": expect.any(String) } });
  });
});

describe("package enquiries", () => {
  it("stores the package snapshot and estimate", async () => {
    const d = await createDestination("Srinagar");
    const pkg = await prisma.package.create({
      data: {
        slug: "honeymoon",
        title: "Honeymoon",
        summary: "S",
        description: "D",
        durationDays: 5,
        durationNights: 4,
        status: "PUBLISHED",
        destinations: { create: { destinationId: d.id, position: 0, days: 5 } },
        pricingRules: { create: { label: "Package", basis: "PER_PACKAGE", amountPaise: 18500_00, includedTravellers: 2, active: true } },
        addons: { create: { name: "Dinner", basis: "PER_GROUP", amountPaise: 2000_00, position: 0 } },
      },
      include: { addons: true },
    });
    const result = await submitPackageEnquiry({ ...trip(d.id), packageId: pkg.id, addonIds: [pkg.addons[0]!.id] }, ctx());
    expect(result).toMatchObject({ ok: true, estimate: { kind: "ESTIMATED", totalPaise: 20500_00 } });
    const enquiry = await prisma.enquiry.findFirstOrThrow();
    expect(enquiry).toMatchObject({ type: "PACKAGE", packageId: pkg.id });
    expect(enquiry.snapshot).toMatchObject({ package: { title: "Honeymoon", durationDays: 5 }, addons: [{ name: "Dinner", amountPaise: 2000_00 }] });

    // Later price changes do not alter what was recorded.
    await prisma.pricingRule.updateMany({ data: { amountPaise: 99999_00 } });
    expect((await prisma.enquiry.findFirstOrThrow()).estimateTotalPaise).toBe(20500_00);
  });

  it("refuses draft packages", async () => {
    const pkg = await prisma.package.create({ data: { slug: "draft", title: "Draft", summary: "S", description: "D", durationDays: 2, durationNights: 1 } });
    const d = await createDestination("X");
    expect(await submitPackageEnquiry({ ...trip(d.id), packageId: pkg.id }, ctx())).toMatchObject({ ok: false, error: "VALIDATION" });
  });
});
