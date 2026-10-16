import "server-only";
import type { EnquiryStatus, EnquiryType } from "@/generated/prisma/enums";
import { addDays, addMonthsToMonth, isoDateToUtcDate, todayInBusinessZone } from "@/domain/dates";
import { ENQUIRY_STATUSES, OPEN_STATUSES } from "@/domain/enquiry-status";
import { prisma } from "./db";

/**
 * Admin dashboard metrics. Every number is aggregated in PostgreSQL from real records; nothing
 * is estimated or invented (there is no booking or revenue data, so none is shown).
 *
 * Definitions (shown to staff on the dashboard):
 * - "Enquiries received" = enquiries created in the period, excluding those marked Spam.
 *   Archived enquiries are included (they were still received).
 * - "Status breakdown" = current status of enquiries received in the period, Spam included.
 * - "Open" = New, Contacted, Quote preparation or Quote sent, not archived (right now).
 * - Days and months are calendar periods in India Standard Time.
 * - "Previous period" = the same number of days (or 12 months) immediately before the period.
 */

export const DASHBOARD_RANGES = {
  "7d": { period: "7 days", label: "Last 7 days", days: 7, unit: "day" },
  "30d": { period: "30 days", label: "Last 30 days", days: 30, unit: "day" },
  "90d": { period: "90 days", label: "Last 90 days", days: 90, unit: "day" },
  "12m": { period: "12 months", label: "Last 12 months", days: 0, unit: "month" },
} as const;
export type DashboardRange = keyof typeof DASHBOARD_RANGES;

export function parseRange(value: unknown): DashboardRange {
  return typeof value === "string" && value in DASHBOARD_RANGES ? (value as DashboardRange) : "30d";
}

export interface TrendPoint {
  /** YYYY-MM-DD (day) or YYYY-MM (month), in IST. */
  bucket: string;
  total: number;
  byType: Record<EnquiryType, number>;
}

/** Midnight IST at the start of an ISO date, as a UTC instant. */
const istMidnight = (isoDate: string) => new Date(isoDateToUtcDate(isoDate).getTime() - 5.5 * 3600 * 1000);

/**
 * The IST calendar buckets of a range, oldest first, the UTC instant the range starts, and the
 * equally long previous period (for comparison) that ends where this one starts.
 */
export function rangeBuckets(range: DashboardRange, now = new Date()) {
  const today = todayInBusinessZone(now);
  const config = DASHBOARD_RANGES[range];
  if (config.unit === "day") {
    const first = addDays(today, -(config.days - 1));
    const buckets = Array.from({ length: config.days }, (_, i) => addDays(first, i));
    const previousBuckets = buckets.map((b) => addDays(b, -config.days));
    return { start: istMidnight(first), previousStart: istMidnight(previousBuckets[0]!), buckets, previousBuckets, unit: "day" as const };
  }
  const month = today.slice(0, 7);
  const buckets = Array.from({ length: 12 }, (_, i) => addMonthsToMonth(month, i - 11));
  const previousBuckets = buckets.map((b) => addMonthsToMonth(b, -12));
  return { start: istMidnight(`${buckets[0]}-01`), previousStart: istMidnight(`${previousBuckets[0]}-01`), buckets, previousBuckets, unit: "month" as const };
}

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"] as const;
const EMPTY_TYPES = (): Record<EnquiryType, number> => ({ CONTACT: 0, PACKAGE: 0, CUSTOM_TRIP: 0 });

export async function getDashboardData(range: DashboardRange, now = new Date()) {
  const { start, previousStart, buckets, previousBuckets, unit } = rangeBuckets(range, now);
  const bucketFormat = unit === "day" ? "YYYY-MM-DD" : "YYYY-MM";
  const live = { archivedAt: null };

  const [trendRows, previousRows, weekdayRows, statusRows, packageRows, destinationRows, newInRange, openNow, dueNow, publishedPackages, publishedDestinations, emailRows, sentInRange, followUps, recent] =
    await Promise.all([
      prisma.$queryRaw<{ bucket: string; type: EnquiryType; n: number }[]>`
        SELECT to_char(date_trunc(${unit}, ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'), ${bucketFormat}) AS bucket,
               type, count(*)::int AS n
        FROM "enquiry"
        WHERE "createdAt" >= ${start} AND status <> 'SPAM'
        GROUP BY 1, 2`,
      prisma.$queryRaw<{ bucket: string; n: number }[]>`
        SELECT to_char(date_trunc(${unit}, ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata'), ${bucketFormat}) AS bucket, count(*)::int AS n
        FROM "enquiry"
        WHERE "createdAt" >= ${previousStart} AND "createdAt" < ${start} AND status <> 'SPAM'
        GROUP BY 1`,
      // ISO day of week in India time: 1 = Monday … 7 = Sunday
      prisma.$queryRaw<{ dow: number; n: number }[]>`
        SELECT extract(isodow FROM ("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::int AS dow, count(*)::int AS n
        FROM "enquiry"
        WHERE "createdAt" >= ${start} AND status <> 'SPAM'
        GROUP BY 1`,
      prisma.enquiry.groupBy({ by: ["status"], where: { createdAt: { gte: start } }, _count: { _all: true } }),
      prisma.enquiry.groupBy({
        by: ["packageId"],
        where: { createdAt: { gte: start }, packageId: { not: null }, status: { not: "SPAM" } },
        _count: { _all: true },
        orderBy: { _count: { packageId: "desc" } },
        take: 6,
      }),
      prisma.enquiryDestination.groupBy({
        by: ["nameSnapshot"],
        where: { enquiry: { createdAt: { gte: start }, status: { not: "SPAM" } } },
        _count: { _all: true },
        orderBy: { _count: { nameSnapshot: "desc" } },
        take: 6,
      }),
      prisma.enquiry.count({ where: { createdAt: { gte: start }, status: { not: "SPAM" } } }),
      prisma.enquiry.count({ where: { ...live, status: { in: [...OPEN_STATUSES] } } }),
      prisma.enquiry.count({ where: { ...live, status: { in: [...OPEN_STATUSES] }, followUpAt: { lte: now } } }),
      prisma.package.count({ where: { status: "PUBLISHED" } }),
      prisma.destination.count({ where: { status: "PUBLISHED" } }),
      prisma.emailDelivery.groupBy({ by: ["status"], where: { status: { in: ["PENDING", "SENDING", "FAILED"] } }, _count: { _all: true } }),
      prisma.emailDelivery.count({ where: { status: "SENT", sentAt: { gte: start } } }),
      prisma.enquiry.findMany({
        where: { ...live, status: { in: [...OPEN_STATUSES] }, followUpAt: { not: null, lte: new Date(now.getTime() + 7 * 86_400_000) } },
        orderBy: { followUpAt: "asc" },
        take: 8,
        select: { id: true, reference: true, customerName: true, status: true, followUpAt: true, assignee: { select: { name: true } } },
      }),
      prisma.enquiry.findMany({
        where: { ...live, status: { not: "SPAM" } },
        orderBy: { createdAt: "desc" },
        take: 8,
        select: { id: true, reference: true, type: true, status: true, customerName: true, createdAt: true, package: { select: { title: true } } },
      }),
    ]);

  // Every bucket in the range appears, zero-filled, so the trend axis is continuous.
  const byBucket = new Map<string, TrendPoint>(buckets.map((b) => [b, { bucket: b, total: 0, byType: EMPTY_TYPES() }]));
  for (const row of trendRows) {
    const point = byBucket.get(row.bucket);
    if (!point) continue; // outside the displayed buckets (clock edge); never miscounted into another bucket
    point.byType[row.type] += row.n;
    point.total += row.n;
  }

  // The previous period, aligned position by position with the current buckets.
  const previousByBucket = new Map(previousRows.map((r) => [r.bucket, r.n]));
  const previousTrend = previousBuckets.map((bucket) => ({ bucket, total: previousByBucket.get(bucket) ?? 0 }));
  const weekdayCounts = new Map(weekdayRows.map((r) => [r.dow, r.n]));
  const weekdays = WEEKDAYS.map((label, i) => ({ label, count: weekdayCounts.get(i + 1) ?? 0 }));

  const packageTitles = new Map(
    (await prisma.package.findMany({ where: { id: { in: packageRows.map((r) => r.packageId!).filter(Boolean) } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]),
  );
  const statusCounts = new Map(statusRows.map((r) => [r.status, r._count._all]));
  const emailCount = (s: string) => emailRows.find((r) => r.status === s)?._count._all ?? 0;

  return {
    range,
    unit,
    start,
    trend: [...byBucket.values()],
    previousTrend,
    previousTotal: previousTrend.reduce((sum, p) => sum + p.total, 0),
    weekdays,
    statuses: ENQUIRY_STATUSES.map((status: EnquiryStatus) => ({ status, count: statusCounts.get(status) ?? 0 })),
    topPackages: packageRows.map((r) => ({ label: packageTitles.get(r.packageId!) ?? "Deleted package", count: r._count._all })),
    topDestinations: destinationRows.map((r) => ({ label: r.nameSnapshot, count: r._count._all })),
    kpis: { newInRange, openNow, dueNow, publishedPackages, publishedDestinations },
    email: { queued: emailCount("PENDING") + emailCount("SENDING"), failed: emailCount("FAILED"), sentInRange },
    followUps,
    recent,
  };
}

export type DashboardData = Awaited<ReturnType<typeof getDashboardData>>;
