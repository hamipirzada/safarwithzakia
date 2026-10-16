import { beforeEach, describe, expect, it } from "vitest";
import { prisma } from "@/server/db";
import { getDashboardData, rangeBuckets } from "@/server/dashboard";
import { enquiryWhere } from "@/server/enquiries/admin";
import { bucketHref } from "@/components/admin/chart-math";
import { createDestination, resetDatabase } from "../support/db";

// "Now" is 16 Oct 2026, 11:30 IST.
const NOW = new Date("2026-10-16T06:00:00Z");
let n = 0;
async function enquiry(createdAt: string, data: { type?: "CONTACT" | "PACKAGE" | "CUSTOM_TRIP"; status?: "NEW" | "CONTACTED" | "QUOTE_SENT" | "CLOSED" | "SPAM"; packageId?: string; archived?: boolean; followUpAt?: string; destinations?: string[] } = {}) {
  n++;
  return prisma.enquiry.create({
    data: {
      reference: `SWZ-2610-T${String(n).padStart(4, "0")}`,
      type: data.type ?? "CONTACT",
      status: data.status ?? "NEW",
      customerName: `Customer ${n}`,
      email: `c${n}@example.test`,
      snapshot: {},
      consentAt: new Date(createdAt),
      createdAt: new Date(createdAt),
      packageId: data.packageId ?? null,
      archivedAt: data.archived ? new Date(createdAt) : null,
      followUpAt: data.followUpAt ? new Date(data.followUpAt) : null,
      destinations: data.destinations ? { create: data.destinations.map((name, position) => ({ nameSnapshot: name, position, days: 1 })) } : undefined,
    },
  });
}

beforeEach(async () => {
  await resetDatabase();
  n = 0;
});

describe("dashboard figures come from the database", () => {
  it("returns a continuous, zero-filled period and honest zeros on an empty database", async () => {
    const data = await getDashboardData("7d", NOW);
    expect(data.trend).toHaveLength(7);
    expect(data.trend.every((p) => p.total === 0)).toBe(true);
    expect(data.kpis).toEqual({ newInRange: 0, openNow: 0, dueNow: 0, publishedPackages: 0, publishedDestinations: 0 });
    expect(data.topPackages).toEqual([]);
    expect(data.recent).toEqual([]);
  });

  it("buckets by India-time day, excludes spam from volume, and reconciles every figure", async () => {
    const pkg = await prisma.package.create({ data: { slug: "p", title: "Honeymoon", summary: "S", description: "D", durationDays: 2, durationNights: 1, status: "PUBLISHED" } });
    await createDestination("Gulmarg"); // published destination
    // 15 Oct 23:30 IST (18:00 UTC) belongs to 15 Oct, not 16 Oct
    await enquiry("2026-10-15T18:00:00Z", { type: "PACKAGE", packageId: pkg.id, destinations: ["Gulmarg"] });
    // 16 Oct 00:30 IST (19:00 UTC on 15 Oct) belongs to 16 Oct
    await enquiry("2026-10-15T19:00:00Z", { type: "CUSTOM_TRIP", status: "CONTACTED", destinations: ["Gulmarg", "Pahalgam"], followUpAt: "2026-10-16T05:00:00Z" });
    await enquiry("2026-10-16T05:00:00Z", { status: "SPAM" }); // never counted as demand
    await enquiry("2026-10-12T06:00:00Z", { status: "CLOSED", archived: true }); // archived but received in range
    await enquiry("2026-09-01T06:00:00Z", { type: "PACKAGE", packageId: pkg.id }); // outside 7 days
    await prisma.emailDelivery.createMany({
      data: [
        { idempotencyKey: "a", kind: "TEST", toAddress: "x@example.test", subject: "s", html: "h", text: "t", status: "SENT", sentAt: new Date("2026-10-14T06:00:00Z") },
        { idempotencyKey: "b", kind: "TEST", toAddress: "x@example.test", subject: "s", html: "h", text: "t", status: "PENDING" },
        { idempotencyKey: "c", kind: "TEST", toAddress: "x@example.test", subject: "s", html: "h", text: "t", status: "FAILED" },
        { idempotencyKey: "d", kind: "TEST", toAddress: "x@example.test", subject: "s", html: "h", text: "t", status: "SENT", sentAt: new Date("2026-08-01T06:00:00Z") },
      ],
    });

    const data = await getDashboardData("7d", NOW);
    const day = (d: string) => data.trend.find((p) => p.bucket === d)!;
    expect(day("2026-10-15")).toMatchObject({ total: 1, byType: { CONTACT: 0, PACKAGE: 1, CUSTOM_TRIP: 0 } });
    expect(day("2026-10-16")).toMatchObject({ total: 1, byType: { CONTACT: 0, PACKAGE: 0, CUSTOM_TRIP: 1 } });
    expect(day("2026-10-12").total).toBe(1);
    expect(data.trend.reduce((s, p) => s + p.total, 0)).toBe(3);
    expect(data.kpis.newInRange).toBe(3); // matches the trend total

    // Status breakdown: current status of everything received in the period, spam included
    const statuses = Object.fromEntries(data.statuses.map((s) => [s.status, s.count]));
    expect(statuses).toMatchObject({ NEW: 1, CONTACTED: 1, SPAM: 1, CLOSED: 1, QUOTE_SENT: 0 });

    expect(data.kpis.openNow).toBe(3); // right now, not period-scoped: the two recent open ones + the September one (still New)
    expect(data.kpis.dueNow).toBe(1);
    expect(data.kpis.publishedPackages).toBe(1);
    expect(data.kpis.publishedDestinations).toBe(1);
    expect(data.topPackages).toEqual([{ label: "Honeymoon", count: 1 }]);
    expect(data.topDestinations).toEqual([{ label: "Gulmarg", count: 2 }, { label: "Pahalgam", count: 1 }]);
    expect(data.email).toEqual({ queued: 1, failed: 1, sentInRange: 1 });
    expect(data.followUps.map((f) => f.customerName)).toEqual(["Customer 2"]);
    expect(data.recent.map((r) => r.customerName)).not.toContain("Customer 3"); // spam excluded
  });

  it("monthly buckets for the 12-month view", async () => {
    await enquiry("2026-09-01T06:00:00Z");
    await enquiry("2026-09-20T06:00:00Z");
    await enquiry("2025-12-05T06:00:00Z");
    const data = await getDashboardData("12m", NOW);
    expect(data.trend).toHaveLength(12);
    expect(data.trend.find((p) => p.bucket === "2026-09")!.total).toBe(2);
    expect(data.trend.find((p) => p.bucket === "2025-12")!.total).toBe(1);
    expect(data.kpis.newInRange).toBe(3);
  });

  it("aligns the previous period position by position and never counts spam in it", async () => {
    // 7-day range ending 16 Oct: current 10–16 Oct, previous 3–9 Oct (IST).
    await enquiry("2026-10-09T18:00:00Z"); // 9 Oct 23:30 IST → previous period, last position
    await enquiry("2026-10-09T18:40:00Z"); // 10 Oct 00:10 IST → current period, first position
    await enquiry("2026-10-03T00:00:00Z"); // 3 Oct 05:30 IST → previous, first position
    await enquiry("2026-10-04T06:00:00Z", { status: "SPAM" }); // excluded
    await enquiry("2026-10-02T17:00:00Z"); // 2 Oct 22:30 IST → before the previous period
    const data = await getDashboardData("7d", NOW);
    expect(data.previousTrend.map((p) => p.bucket)).toEqual(["2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08", "2026-10-09"]);
    expect(data.previousTrend.map((p) => p.total)).toEqual([1, 0, 0, 0, 0, 0, 1]);
    expect(data.previousTotal).toBe(2);
    expect(data.trend[0]).toMatchObject({ bucket: "2026-10-10", total: 1 });
    expect(data.kpis.newInRange).toBe(1);
  });

  it("compares 12 months with the 12 months before", async () => {
    // Current period: Nov 2025 … Oct 2026. Previous period: Nov 2024 … Oct 2025 (IST months).
    await enquiry("2025-10-31T17:00:00Z"); // 31 Oct 2025 22:30 IST → previous period, last month
    await enquiry("2025-09-30T19:00:00Z"); // 1 Oct 2025 00:30 IST (30 Sep in UTC) → Oct 2025
    await enquiry("2025-09-30T17:00:00Z"); // 30 Sep 2025 22:30 IST → Sep 2025, previous period
    await enquiry("2024-10-15T06:00:00Z"); // Oct 2024 → before the previous period
    const data = await getDashboardData("12m", NOW);
    expect(data.trend[0]).toMatchObject({ bucket: "2025-11", total: 0 });
    expect(data.previousTrend[0]).toEqual({ bucket: "2024-11", total: 0 });
    expect(data.previousTrend.at(-1)).toEqual({ bucket: "2025-10", total: 2 });
    expect(data.previousTotal).toBe(3);
    const { buckets, previousBuckets } = rangeBuckets("12m", NOW);
    expect(buckets).toHaveLength(12);
    expect(previousBuckets).toHaveLength(12);
  });

  it("counts enquiries per India-time weekday", async () => {
    // 11 Oct 2026 is a Sunday; 12 Oct a Monday.
    await enquiry("2026-10-11T18:00:00Z"); // Sun 23:30 IST
    await enquiry("2026-10-11T19:00:00Z"); // Mon 00:30 IST (still Sunday in UTC)
    await enquiry("2026-10-12T06:00:00Z"); // Mon
    await enquiry("2026-10-14T06:00:00Z", { type: "PACKAGE" }); // Wed
    await enquiry("2026-10-14T07:00:00Z", { status: "SPAM" }); // excluded
    const data = await getDashboardData("7d", NOW);
    expect(data.weekdays).toEqual([
      { label: "Mon", count: 2 },
      { label: "Tue", count: 0 },
      { label: "Wed", count: 1 },
      { label: "Thu", count: 0 },
      { label: "Fri", count: 0 },
      { label: "Sat", count: 0 },
      { label: "Sun", count: 1 },
    ]);
    expect(data.weekdays.reduce((s, d) => s + d.count, 0)).toBe(data.kpis.newInRange);
  });

  it("a trend point's click-through filter lists exactly that bucket's enquiries", async () => {
    await enquiry("2026-10-14T18:29:00Z"); // 14 Oct 23:59 IST
    await enquiry("2026-10-14T18:31:00Z"); // 15 Oct 00:01 IST
    await enquiry("2026-10-15T10:00:00Z", { type: "PACKAGE" }); // 15 Oct
    await enquiry("2026-10-15T11:00:00Z", { status: "SPAM" }); // not in the list or the chart
    const data = await getDashboardData("7d", NOW);
    for (const point of data.trend) {
      const params = new URL(bucketHref(point.bucket, "day"), "http://x").searchParams;
      const listed = await prisma.enquiry.count({ where: enquiryWhere({ receivedFrom: params.get("from")!, receivedTo: params.get("to")! }) });
      expect(listed, point.bucket).toBe(point.total);
    }
    // Month links cover the whole month.
    const months = await getDashboardData("12m", NOW);
    const oct = months.trend.find((p) => p.bucket === "2026-10")!;
    const params = new URL(bucketHref("2026-10", "month"), "http://x").searchParams;
    expect(await prisma.enquiry.count({ where: enquiryWhere({ receivedFrom: params.get("from")!, receivedTo: params.get("to")! }) })).toBe(oct.total);
    expect(oct.total).toBe(3);
  });
});
