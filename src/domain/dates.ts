/**
 * Calendar-date helpers. Travel dates are plain calendar dates (YYYY-MM-DD) with no time zone;
 * "today" is evaluated in the business time zone (Asia/Kolkata).
 */

export const BUSINESS_TIME_ZONE = "Asia/Kolkata";

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const ISO_MONTH = /^(\d{4})-(0[1-9]|1[0-2])$/;

export function isIsoDate(value: string): boolean {
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [, y, m, d] = match.map(Number) as [number, number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

export function isIsoMonth(value: string): boolean {
  return ISO_MONTH.test(value);
}

/** Today's calendar date in the business time zone. */
export function todayInBusinessZone(now: Date): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: BUSINESS_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

export function addDays(isoDate: string, days: number): string {
  const [y, m, d] = isoDate.split("-").map(Number) as [number, number, number];
  const date = new Date(Date.UTC(y, m - 1, d + days));
  return date.toISOString().slice(0, 10);
}

export function addMonthsToMonth(isoMonth: string, months: number): string {
  const [y, m] = isoMonth.split("-").map(Number) as [number, number];
  const date = new Date(Date.UTC(y, m - 1 + months, 1));
  return date.toISOString().slice(0, 7);
}

/** "MM-DD" of an ISO date. */
export function monthDay(isoDate: string): string {
  return isoDate.slice(5, 10);
}

/**
 * Whether a "MM-DD" falls inside an inclusive season. Seasons may wrap the year end,
 * e.g. 12-15 → 02-28 covers mid-December to February.
 */
export function isWithinSeason(md: string, start: string, end: string): boolean {
  return start <= end ? md >= start && md <= end : md >= start || md <= end;
}

/** Convert a YYYY-MM-DD string to a Date at UTC midnight for @db.Date columns. */
export function isoDateToUtcDate(isoDate: string): Date {
  return new Date(`${isoDate}T00:00:00.000Z`);
}

export function utcDateToIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function formatIsoDate(isoDate: string): string {
  return new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(
    isoDateToUtcDate(isoDate),
  );
}

export function formatIsoMonth(isoMonth: string): string {
  return new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(
    isoDateToUtcDate(`${isoMonth}-01`),
  );
}

/** Timestamp with explicit zone, for emails and admin views, e.g. "16 Oct 2026, 7:45 pm IST". */
export function formatDateTime(date: Date): string {
  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone: BUSINESS_TIME_ZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
  return `${formatted} IST`;
}
