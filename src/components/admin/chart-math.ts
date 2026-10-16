/**
 * Pure helpers behind the dashboard charts: scales, paths, stacking, comparisons and labels.
 * Kept free of React and the DOM so every number a chart draws can be unit-tested.
 */

export type Unit = "day" | "month";
export type EnquiryKind = "CONTACT" | "PACKAGE" | "CUSTOM_TRIP";
export const KINDS: readonly EnquiryKind[] = ["CONTACT", "PACKAGE", "CUSTOM_TRIP"];
export const KIND_LABELS: Record<EnquiryKind, string> = { CONTACT: "Contact", PACKAGE: "Package", CUSTOM_TRIP: "Custom trip" };

/**
 * Categorical slots 1–3 of the documented palette, in fixed order (never cycled). Validated on the
 * admin surface #fffdf9 with --pairs all: band, chroma, CVD (worst ΔE 9.2) and normal-vision floor
 * pass. Aqua is 2.77:1 against the surface, so the legend and table view are always present.
 */
export const KIND_COLORS: Record<EnquiryKind, string> = { CONTACT: "#2a78d6", PACKAGE: "#eb6834", CUSTOM_TRIP: "#1baf7a" };
export const SERIES = KIND_COLORS.CONTACT;
/** The comparison (previous period) line is neutral ink, dashed, so it never reads as a category. */
export const COMPARE = "#8a8173";

/** A rounded axis maximum: 1, 2, 2.5 or 5 × 10ⁿ, at least 4 so small counts get whole-number ticks. */
export function niceMax(value: number): number {
  if (!Number.isFinite(value) || value <= 4) return 4;
  const power = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (step * power >= value) return step * power;
  return 10 * power;
}

/** Five evenly spaced ticks from 0 to max. */
export function ticks(max: number): number[] {
  return [0, 1, 2, 3, 4].map((i) => (max * i) / 4);
}

export function formatTick(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

/** Bucket label: "3 Oct" / "3 Oct 2026" for days, "Oct 2026" / "October 2026" for months. */
export function formatBucket(bucket: string, unit: Unit, long = false): string {
  const date = new Date(`${unit === "month" ? `${bucket}-01` : bucket}T00:00:00Z`);
  return new Intl.DateTimeFormat(
    "en-IN",
    unit === "month" ? { month: long ? "long" : "short", year: "numeric", timeZone: "UTC" } : { day: "numeric", month: "short", ...(long ? { year: "numeric" } : {}), timeZone: "UTC" },
  ).format(date);
}

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
export const enquiries = (n: number) => plural(n, "enquiry", "enquiries");

/**
 * Percentage change from the previous period, rounded. `null` when there is nothing to compare
 * with (the previous period had none), so no infinite or invented percentage is ever shown.
 */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  return Math.round(((current - previous) / previous) * 100);
}

/** A plain-language comparison, e.g. "Up 25% on the previous 30 days". */
export function describeChange(current: number, previous: number, periodLabel: string): string {
  const change = percentChange(current, previous);
  if (change === null) return current === 0 ? `None in the previous ${periodLabel} either` : `None in the previous ${periodLabel}`;
  if (change === 0) return `Same as the previous ${periodLabel}`;
  return `${change > 0 ? "Up" : "Down"} ${Math.abs(change)}% on the previous ${periodLabel}`;
}

export interface Frame {
  width: number;
  height: number;
  pad: { top: number; right: number; bottom: number; left: number };
}

/** x and y scales for `count` evenly spaced points from 0 to `max`. */
export function scales(frame: Frame, count: number, max: number) {
  const innerW = Math.max(1, frame.width - frame.pad.left - frame.pad.right);
  const innerH = Math.max(1, frame.height - frame.pad.top - frame.pad.bottom);
  const x = (i: number) => frame.pad.left + (count <= 1 ? innerW / 2 : (i / (count - 1)) * innerW);
  const y = (v: number) => frame.pad.top + innerH - (Math.max(0, v) / max) * innerH;
  return { x, y, innerW, innerH };
}

/** Nearest point index for a horizontal pixel position inside the chart (clamped). */
export function indexAt(px: number, frame: Frame, count: number): number {
  if (count <= 1) return 0;
  const innerW = Math.max(1, frame.width - frame.pad.left - frame.pad.right);
  const i = Math.round(((px - frame.pad.left) / innerW) * (count - 1));
  return Math.min(Math.max(i, 0), count - 1);
}

type Pt = readonly [number, number];
const fmt = (n: number) => (Math.round(n * 10) / 10).toString();

/** Straight-segment path through points (a count series is not interpolated between buckets). */
export function linePath(points: readonly Pt[]): string {
  return points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${fmt(px)},${fmt(py)}`).join(" ");
}

/** Closed area between an upper line and a lower line (lower given left-to-right). */
export function bandPath(upper: readonly Pt[], lower: readonly Pt[]): string {
  if (upper.length === 0) return "";
  const back = [...lower].reverse();
  return `${linePath(upper)} ${back.map(([px, py]) => `L${fmt(px)},${fmt(py)}`).join(" ")} Z`;
}

export interface StackLayer {
  kind: EnquiryKind;
  /** [lower, upper] cumulative values for each point. */
  values: [number, number][];
}

/** Cumulative layers for a stacked area, in fixed kind order, skipping hidden kinds. */
export function stack(data: readonly { byType: Record<EnquiryKind, number> }[], visible: readonly EnquiryKind[]): StackLayer[] {
  const base = data.map(() => 0);
  return KINDS.filter((k) => visible.includes(k)).map((kind) => ({
    kind,
    values: data.map((d, i) => {
      const lower = base[i]!;
      base[i] = lower + d.byType[kind];
      return [lower, base[i]!] as [number, number];
    }),
  }));
}

/** Show at most one x label per ~72px, always including the first and last. */
export function labelStep(count: number, innerW: number): number {
  return Math.max(1, Math.ceil(count / Math.max(2, Math.floor(innerW / 72))));
}

/**
 * Indices that get an x-axis label: every `labelStep`-th point plus the last, dropping a regular
 * label that would sit too close to the last one (so labels never overlap at the end).
 */
export function axisLabelIndices(count: number, innerW: number): number[] {
  if (count <= 0) return [];
  const step = labelStep(count, innerW);
  const last = count - 1;
  const out: number[] = [];
  for (let i = 0; i < last; i += step) if (last - i >= Math.max(1, step * 0.75)) out.push(i);
  out.push(last);
  return out;
}

export interface TrendSummary {
  total: number;
  average: number;
  peak: { index: number; value: number } | null;
}

export function summarise(values: readonly number[]): TrendSummary {
  const total = values.reduce((s, v) => s + v, 0);
  let peak: TrendSummary["peak"] = null;
  values.forEach((value, index) => {
    if (value > 0 && (!peak || value > peak.value)) peak = { index, value };
  });
  return { total, average: values.length ? total / values.length : 0, peak };
}

/** Share of a total as a whole percentage ("<1%" for a non-zero sliver). */
export function share(count: number, total: number): string {
  if (total <= 0 || count <= 0) return "0%";
  const pct = (count / total) * 100;
  return pct < 1 ? "<1%" : `${Math.round(pct)}%`;
}

/** Link to the enquiry list for the India-time dates one trend bucket covers. */
export function bucketHref(bucket: string, unit: Unit): string {
  if (unit === "day") return `/admin/enquiries?from=${bucket}&to=${bucket}`;
  const [y, m] = bucket.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `/admin/enquiries?from=${bucket}-01&to=${bucket}-${String(last).padStart(2, "0")}`;
}
