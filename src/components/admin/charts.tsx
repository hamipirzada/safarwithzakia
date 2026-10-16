"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownRight, ArrowRight, ArrowUpRight } from "lucide-react";
import {
  bandPath,
  bucketHref,
  COMPARE,
  enquiries,
  formatBucket,
  formatTick,
  indexAt,
  KIND_COLORS,
  KIND_LABELS,
  KINDS,
  axisLabelIndices,
  linePath,
  niceMax,
  percentChange,
  scales,
  SERIES,
  share,
  stack,
  summarise,
  ticks,
  type EnquiryKind,
  type Frame,
  type Unit,
} from "./chart-math";

/**
 * Dashboard charts (hand-built SVG/HTML, no chart library), following the project's data-viz
 * method: validated categorical hues in fixed order, 2px lines over a soft gradient wash, a solid
 * hairline grid, bars ≤ 12px with 4px rounded data-ends, values in ink (never the series colour),
 * a crosshair tooltip that is also keyboard-driven, a legend whenever there is more than one series,
 * and a table view for every chart. Entry animations are disabled for prefers-reduced-motion by the
 * global stylesheet.
 */

const GRID = "#ece6da";
const AXIS_TEXT = "var(--color-muted)";

export interface TrendDatum {
  bucket: string; // YYYY-MM-DD or YYYY-MM
  total: number;
  byType: Record<EnquiryKind, number>;
}
export interface PreviousDatum {
  bucket: string;
  total: number;
}

function useWidth<T extends HTMLElement>(fallback: number) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => entry && setWidth(Math.max(240, Math.round(entry.contentRect.width))));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

export function TableToggle({ shown, onToggle, controls }: { shown: boolean; onToggle: () => void; controls: string }) {
  return (
    <button
      type="button"
      className="rounded-full px-2.5 py-1 text-xs font-medium text-muted transition-colors hover:bg-paper-deep hover:text-ink"
      aria-expanded={shown}
      aria-controls={controls}
      onClick={onToggle}
    >
      {shown ? "Show chart" : "Show table"}
    </button>
  );
}

function Segmented<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-full border border-line bg-paper/70 p-0.5">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className="rounded-full px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-ink aria-pressed:bg-surface aria-pressed:text-ink aria-pressed:shadow-[0_1px_2px_rgb(22_33_44/0.12)]"
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

/** Change against the previous period, as an arrow icon plus words (never colour alone). */
export function ChangeNote({ current, previous, periodLabel }: { current: number; previous: number; periodLabel: string }) {
  const change = percentChange(current, previous);
  const Icon = change === null || change === 0 ? ArrowRight : change > 0 ? ArrowUpRight : ArrowDownRight;
  const text = change === null ? (current === 0 ? "none in either period" : `new this period (0 in previous ${periodLabel})`) : change === 0 ? `same as previous ${periodLabel}` : `${Math.abs(change)}% ${change > 0 ? "up" : "down"} on previous ${periodLabel}`;
  return (
    <span className="inline-flex items-center gap-1 text-xs text-ink-soft" data-testid="change-note" data-change={change ?? ""}>
      <Icon aria-hidden size={14} className={change === null || change === 0 ? "text-muted" : change > 0 ? "text-success" : "text-warning"} />
      {text}
    </span>
  );
}

type TrendMode = "total" | "type";

/**
 * Enquiries per day/month. "Total" shows one line with a gradient wash; "By type" stacks the three
 * enquiry types (legend entries toggle each one). The previous period can be overlaid as a dashed
 * neutral line. Hover, touch or arrow keys read any bucket; clicking (or Enter) opens that day's or
 * month's enquiries.
 */
export function TrendChart({ data, previous, unit, label, periodLabel }: { data: TrendDatum[]; previous: PreviousDatum[]; unit: Unit; label: string; periodLabel: string }) {
  const router = useRouter();
  const [wrapRef, width] = useWidth<HTMLDivElement>(640);
  const [active, setActive] = useState<number | null>(null);
  const [table, setTable] = useState(false);
  const [mode, setMode] = useState<TrendMode>("total");
  const [compare, setCompare] = useState(false);
  const [visible, setVisible] = useState<EnquiryKind[]>([...KINDS]);
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const tableId = `${uid}-view`;

  const frame: Frame = { width, height: 260, pad: { top: 18, right: 40, bottom: 30, left: 34 } };
  const last = data.length - 1;
  const summary = useMemo(() => summarise(data.map((d) => d.total)), [data]);
  const previousTotal = previous.reduce((s, p) => s + p.total, 0);
  const layers = useMemo(() => stack(data, visible), [data, visible]);
  const shownTotals = mode === "type" ? data.map((_, i) => layers.at(-1)?.values[i]?.[1] ?? 0) : data.map((d) => d.total);
  const max = niceMax(Math.max(0, ...shownTotals, ...(compare ? previous.map((p) => p.total) : [])));
  const { x, y, innerW, innerH } = scales(frame, data.length, max);
  const baseline = y(0);
  const step = data.length > 1 ? innerW / (data.length - 1) : innerW;
  const labelled = new Set(axisLabelIndices(data.length, innerW));

  const totalLine = data.map((d, i) => [x(i), y(d.total)] as const);
  const previousLine = previous.map((p, i) => [x(i), y(p.total)] as const);
  const drawKey = `${data[0]?.bucket}-${mode}-${visible.join()}`;

  // Touch has no hover: the first tap reads a point, a second tap on the same point opens it.
  const [touch, setTouch] = useState(false);
  const activeAtDown = useRef<number | null>(null);
  const indexFor = (event: React.PointerEvent<SVGSVGElement>) => indexAt(event.clientX - event.currentTarget.getBoundingClientRect().left, frame, data.length);
  const pointerMove = (event: React.PointerEvent<SVGSVGElement>) => {
    if (event.pointerType === "mouse") setActive(indexFor(event));
  };
  const pointerDown = (event: React.PointerEvent<SVGSVGElement>) => {
    activeAtDown.current = active;
    setTouch(event.pointerType !== "mouse");
    setActive(indexFor(event));
  };
  const click = () => {
    if (touch && activeAtDown.current !== active) return; // first tap: just show the reading
    open(active);
  };
  const open = (i: number | null) => {
    if (i !== null && data[i]) router.push(bucketHref(data[i]!.bucket, unit));
  };
  const keys = (event: React.KeyboardEvent) => {
    setTouch(false);
    if (event.key === "Enter" && active !== null) return open(active);
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    setActive((current) => {
      const at = current ?? last;
      if (event.key === "Home") return 0;
      if (event.key === "End") return last;
      return Math.min(Math.max(at + (event.key === "ArrowRight" ? 1 : -1), 0), last);
    });
  };
  const toggleKind = (kind: EnquiryKind) =>
    setVisible((v) => (v.includes(kind) ? (v.length === 1 ? v : v.filter((k) => k !== kind)) : KINDS.filter((k) => k === kind || v.includes(k))));

  const point = active !== null ? data[active] : null;
  const prevPoint = active !== null ? previous[active] : null;
  const unitWord = unit === "day" ? "day" : "month";
  const announce = point
    ? `${formatBucket(point.bucket, unit, true)}: ${enquiries(point.total)}${compare && prevPoint ? `; previous period ${prevPoint.total}` : ""}. Press Enter to open them.`
    : "";

  if (summary.total === 0 && previousTotal === 0) {
    return <EmptyChart message="No enquiries were received in this period." />;
  }

  const tooltipLeft = active !== null ? (x(active) > width - 200 ? x(active) - 196 : x(active) + 14) : 0;

  return (
    <div>
      <dl className="mb-4 grid grid-cols-3 gap-3 sm:flex sm:gap-8" data-testid="trend-summary">
        <div>
          <dt className="text-xs text-muted">Total</dt>
          <dd className="text-xl font-semibold text-ink tabular-nums" data-testid="trend-total">{summary.total}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Average per {unitWord}</dt>
          <dd className="text-xl font-semibold text-ink tabular-nums" data-testid="trend-average">{summary.average.toFixed(1)}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Busiest {unitWord}</dt>
          <dd className="text-xl font-semibold text-ink tabular-nums" data-testid="trend-peak">
            {summary.peak ? (
              <>
                {summary.peak.value} <span className="text-xs font-normal text-muted">on {formatBucket(data[summary.peak.index]!.bucket, unit)}</span>
              </>
            ) : (
              "—"
            )}
          </dd>
        </div>
        <div className="col-span-3 self-end sm:ml-auto">
          <ChangeNote current={summary.total} previous={previousTotal} periodLabel={periodLabel} />
        </div>
      </dl>

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Segmented label="Chart view" value={mode} onChange={setMode} options={[{ value: "total", label: "Total" }, { value: "type", label: "By type" }]} />
          <button
            type="button"
            aria-pressed={compare}
            onClick={() => setCompare((c) => !c)}
            className="inline-flex items-center gap-1.5 rounded-full border border-line px-3 py-1 text-xs font-medium text-muted transition-colors hover:text-ink aria-pressed:border-ink-soft aria-pressed:text-ink"
          >
            <svg aria-hidden width="16" height="4"><line x1="0" x2="16" y1="2" y2="2" stroke={COMPARE} strokeWidth="2" strokeDasharray="4 3" /></svg>
            Compare with previous {periodLabel}
          </button>
        </div>
        <TableToggle shown={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>

      {table ? (
        <div id={tableId} className="max-h-80 overflow-y-auto rounded-sm border border-line">
          <table className="w-full text-sm">
            <caption className="sr-only">{label}</caption>
            <thead className="sticky top-0 bg-paper text-left text-xs text-muted">
              <tr>
                <th className="px-3 py-2 font-medium">{unit === "day" ? "Day" : "Month"}</th>
                <th className="px-3 py-2 text-right font-medium">Enquiries</th>
                {KINDS.map((k) => <th key={k} className="px-3 py-2 text-right font-medium">{KIND_LABELS[k]}</th>)}
                <th className="px-3 py-2 text-right font-medium">Previous period</th>
              </tr>
            </thead>
            <tbody className="tabular-nums">
              {data.map((d, i) => (
                <tr key={d.bucket} className="border-t border-line">
                  <td className="px-3 py-1.5">{formatBucket(d.bucket, unit, true)}</td>
                  <td className="px-3 py-1.5 text-right font-medium">{d.total}</td>
                  {KINDS.map((k) => <td key={k} className="px-3 py-1.5 text-right text-muted">{d.byType[k]}</td>)}
                  <td className="px-3 py-1.5 text-right text-muted">{previous[i]?.total ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div ref={wrapRef} id={tableId} className="relative">
          {(mode === "type" || compare) && (
            <ul className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs" aria-label="Legend" data-testid="trend-legend">
              {mode === "type" ? (
                KINDS.map((k) => {
                  const on = visible.includes(k);
                  const count = data.reduce((s, d) => s + d.byType[k], 0);
                  return (
                    <li key={k}>
                      <button
                        type="button"
                        aria-pressed={on}
                        disabled={on && visible.length === 1}
                        onClick={() => toggleKind(k)}
                        title={on && visible.length === 1 ? "At least one type stays visible" : on ? `Hide ${KIND_LABELS[k]}` : `Show ${KIND_LABELS[k]}`}
                        className="inline-flex items-center gap-1.5 rounded-full px-1.5 py-0.5 text-ink-soft transition-opacity hover:bg-paper-deep disabled:cursor-not-allowed aria-[pressed=false]:opacity-45"
                      >
                        <span aria-hidden className="h-2.5 w-2.5 rounded-[3px]" style={{ background: KIND_COLORS[k] }} />
                        {KIND_LABELS[k]} <span className="font-semibold text-ink tabular-nums">{count}</span>
                      </button>
                    </li>
                  );
                })
              ) : (
                <li className="inline-flex items-center gap-1.5 text-ink-soft">
                  <span aria-hidden className="h-0.5 w-4 rounded-full" style={{ background: SERIES }} /> This {periodLabel}
                </li>
              )}
              {compare && (
                <li className="inline-flex items-center gap-1.5 text-ink-soft">
                  <svg aria-hidden width="16" height="4"><line x1="0" x2="16" y1="2" y2="2" stroke={COMPARE} strokeWidth="2" strokeDasharray="4 3" /></svg>
                  Previous {periodLabel} <span className="font-semibold text-ink tabular-nums">{previousTotal}</span>
                </li>
              )}
            </ul>
          )}
          <svg
            key={drawKey}
            width={width}
            height={frame.height}
            role="group"
            aria-label={`${label}. ${enquiries(summary.total)} in total. Use the arrow keys to read each ${unitWord}, Enter to open its enquiries.`}
            tabIndex={0}
            onPointerMove={pointerMove}
            onPointerDown={pointerDown}
            onPointerLeave={(e) => e.pointerType === "mouse" && setActive(null)}
            onClick={click}
            onKeyDown={keys}
            onBlur={() => setActive(null)}
            className="block cursor-pointer touch-pan-y rounded-xs outline-none select-none focus-visible:outline-2 focus-visible:outline-lake"
            data-chart="trend"
            data-mode={mode}
            data-compare={compare ? "on" : "off"}
          >
            <defs>
              <linearGradient id={`${uid}-wash`} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor={SERIES} stopOpacity={0.22} />
                <stop offset="100%" stopColor={SERIES} stopOpacity={0.01} />
              </linearGradient>
            </defs>

            {ticks(max).map((t) => (
              <g key={t}>
                <line x1={frame.pad.left} x2={width - frame.pad.right} y1={y(t)} y2={y(t)} stroke={GRID} strokeWidth={1} strokeDasharray={t === 0 ? undefined : "2 4"} />
                <text x={frame.pad.left - 8} y={y(t)} dy="0.32em" textAnchor="end" fontSize={11} fill={AXIS_TEXT} className="tabular-nums">
                  {formatTick(t)}
                </text>
              </g>
            ))}
            {data.map((d, i) =>
              labelled.has(i) ? (
                <text key={d.bucket} x={x(i)} y={frame.height - 8} textAnchor={i === 0 ? "start" : i === last ? "end" : "middle"} fontSize={11} fill={AXIS_TEXT}>
                  {formatBucket(d.bucket, unit)}
                </text>
              ) : null,
            )}

            {/* Hovered bucket band */}
            {active !== null && <rect x={Math.max(frame.pad.left, x(active) - step / 2)} width={Math.min(step, innerW)} y={frame.pad.top} height={innerH} fill="var(--color-ink)" opacity={0.04} />}

            {mode === "total" ? (
              <>
                <path className="chart-fade" d={bandPath(totalLine, totalLine.map(([px]) => [px, baseline] as const))} fill={`url(#${uid}-wash)`} />
                <path className="chart-draw" pathLength={1} d={linePath(totalLine)} fill="none" stroke={SERIES} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" data-series="total" />
              </>
            ) : (
              layers.map((layer) => {
                const upper = layer.values.map(([, hi], i) => [x(i), y(hi)] as const);
                const lower = layer.values.map(([lo], i) => [x(i), y(lo)] as const);
                return (
                  <g key={layer.kind} data-series={layer.kind}>
                    <path className="chart-fade" d={bandPath(upper, lower)} fill={KIND_COLORS[layer.kind]} fillOpacity={0.78} />
                    {/* 2px surface gap between stacked layers */}
                    <path d={linePath(upper)} fill="none" stroke="var(--color-surface)" strokeWidth={2} strokeLinejoin="round" />
                  </g>
                );
              })
            )}

            {compare && <path d={linePath(previousLine)} fill="none" stroke={COMPARE} strokeWidth={2} strokeDasharray="5 4" strokeLinejoin="round" strokeLinecap="round" data-series="previous" />}

            {/* End label: the latest value */}
            {mode === "total" && active === null && (
              <g>
                <circle cx={x(last)} cy={y(data[last]!.total)} r={4} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
                <text x={x(last) + 8} y={y(data[last]!.total)} dy="0.32em" fontSize={12} fontWeight={600} fill="var(--color-ink)">
                  {data[last]!.total}
                </text>
              </g>
            )}

            {point && active !== null && (
              <g aria-hidden>
                <line x1={x(active)} x2={x(active)} y1={frame.pad.top} y2={baseline} stroke="var(--color-ink-soft)" strokeWidth={1} />
                {compare && prevPoint && <circle cx={x(active)} cy={y(prevPoint.total)} r={4} fill="var(--color-surface)" stroke={COMPARE} strokeWidth={2} />}
                {mode === "total" ? (
                  <circle cx={x(active)} cy={y(point.total)} r={5} fill={SERIES} stroke="var(--color-surface)" strokeWidth={2} />
                ) : (
                  layers.map((l) => <circle key={l.kind} cx={x(active)} cy={y(l.values[active]![1])} r={4} fill={KIND_COLORS[l.kind]} stroke="var(--color-surface)" strokeWidth={2} />)
                )}
              </g>
            )}
          </svg>

          {point && active !== null && (
            <div
              role="presentation"
              data-testid="trend-tooltip"
              className="pointer-events-none absolute top-8 z-10 w-[11.5rem] rounded-md border border-line bg-surface/95 px-3 py-2.5 text-xs shadow-[0_8px_24px_rgb(22_33_44/0.12)] backdrop-blur-sm"
              style={{ left: Math.max(0, tooltipLeft) }}
            >
              <p className="font-medium text-muted">{formatBucket(point.bucket, unit, true)}</p>
              <p className="mt-0.5 text-lg leading-tight font-semibold text-ink tabular-nums" data-testid="tooltip-total">
                {point.total} <span className="text-xs font-normal text-muted">{point.total === 1 ? "enquiry" : "enquiries"}</span>
              </p>
              <ul className="mt-2 space-y-1 border-t border-line pt-2 text-ink-soft">
                {KINDS.map((k) => (
                  <li key={k} className={`flex items-center justify-between gap-2 ${mode === "type" && !visible.includes(k) ? "opacity-45" : ""}`} data-kind={k}>
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden className="h-2 w-2 rounded-[2px]" style={{ background: KIND_COLORS[k] }} />
                      {KIND_LABELS[k]}
                    </span>
                    <span className="font-semibold text-ink tabular-nums">{point.byType[k]}</span>
                  </li>
                ))}
              </ul>
              {compare && prevPoint && (
                <p className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2 text-ink-soft" data-testid="tooltip-previous">
                  <span>Previous · {formatBucket(prevPoint.bucket, unit)}</span>
                  <span className="font-semibold text-ink tabular-nums">{prevPoint.total}</span>
                </p>
              )}
              <p className="mt-2 text-[11px] text-muted">{point.total > 0 ? (touch ? "Tap again to open these enquiries" : "Click to open these enquiries") : `No enquiries this ${unitWord}`}</p>
            </div>
          )}
          <p className="sr-only" aria-live="polite">{announce}</p>
        </div>
      )}
    </div>
  );
}

export interface BarDatum {
  label: string;
  count: number;
  href?: string;
}

/**
 * Horizontal bars for comparing counts across named categories (one series, one hue). Each row
 * shows its count and share; hovering a row brings it forward and recedes the others.
 */
export function BarList({ data, label, unitLabel, emptyMessage, total: totalProp }: { data: BarDatum[]; label: string; unitLabel: string; emptyMessage: string; total?: number }) {
  const [table, setTable] = useState(false);
  const tableId = useId();
  const max = useMemo(() => Math.max(...data.map((d) => d.count), 0), [data]);
  const total = totalProp ?? data.reduce((s, d) => s + d.count, 0);
  if (data.length === 0 || max === 0) return <EmptyChart message={emptyMessage} />;

  return (
    <div>
      <div className="mb-2 flex justify-end">
        <TableToggle shown={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <table id={tableId} className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="text-left text-xs text-muted">
            <tr><th className="py-1.5 font-medium">Name</th><th className="py-1.5 text-right font-medium">{unitLabel}</th><th className="py-1.5 text-right font-medium">Share</th></tr>
          </thead>
          <tbody className="tabular-nums">
            {data.map((d) => (
              <tr key={d.label} className="border-t border-line"><td className="py-1.5">{d.label}</td><td className="py-1.5 text-right">{d.count}</td><td className="py-1.5 text-right text-muted">{share(d.count, total)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <ul id={tableId} aria-label={label} className="group/list space-y-3.5" data-chart="bars">
          {data.map((d, i) => {
            const pct = (d.count / max) * 100;
            const pctOfTotal = share(d.count, total);
            const row = (
              <>
                <span className="flex items-baseline justify-between gap-3 text-sm">
                  <span className="truncate text-ink-soft group-hover/row:text-ink">{d.label}</span>
                  <span className="shrink-0 tabular-nums">
                    <span className="font-semibold text-ink">{d.count}</span>
                    <span className="ml-1.5 text-xs text-muted" data-share>{pctOfTotal}</span>
                  </span>
                </span>
                <span className="mt-1.5 block h-2.5 overflow-hidden rounded-r-[4px] bg-paper-deep/70">
                  <span
                    className="bar-grow block h-full rounded-r-[4px] transition-[filter] group-hover/row:brightness-110"
                    style={{ width: `max(${pct}%, 4px)`, background: SERIES, animationDelay: `${i * 50}ms` }}
                    data-bar-width={pct.toFixed(1)}
                  />
                </span>
              </>
            );
            return (
              <li
                key={d.label}
                aria-label={`${d.label}: ${d.count} ${unitLabel.toLowerCase()}, ${pctOfTotal} of ${total}`}
                data-value={d.count}
                className="transition-opacity duration-150 group-hover/list:opacity-50 focus-within:!opacity-100 hover:!opacity-100"
              >
                {d.href ? (
                  <a href={d.href} className="group/row block rounded-xs focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lake">{row}</a>
                ) : (
                  <span className="group/row block">{row}</span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Vertical columns for a short ordered category axis (days of the week). Every column is focusable
 * and shows its value and share on hover or focus; the busiest column is labelled directly.
 */
export function ColumnChart({ data, label, unitLabel, emptyMessage }: { data: BarDatum[]; label: string; unitLabel: string; emptyMessage: string }) {
  const [table, setTable] = useState(false);
  const tableId = useId();
  const max = Math.max(0, ...data.map((d) => d.count));
  const total = data.reduce((s, d) => s + d.count, 0);
  const scaleMax = niceMax(max);
  if (total === 0) return <EmptyChart message={emptyMessage} />;
  const busiest = data.findIndex((d) => d.count === max);
  const ties = data.filter((d) => d.count === max).length;

  return (
    <div>
      <div className="mb-2 flex items-start justify-between gap-3">
        <p className="text-sm text-ink-soft" data-testid="columns-summary">
          {ties > 1 ? (
            <>Busiest: {ties} days tied at <span className="font-semibold text-ink">{max}</span></>
          ) : (
            <>Busiest: <span className="font-semibold text-ink">{data[busiest]!.label}</span>, {max} of {total} ({share(max, total)})</>
          )}
        </p>
        <TableToggle shown={table} onToggle={() => setTable((v) => !v)} controls={tableId} />
      </div>
      {table ? (
        <table id={tableId} className="w-full text-sm">
          <caption className="sr-only">{label}</caption>
          <thead className="text-left text-xs text-muted"><tr><th className="py-1.5 font-medium">Day</th><th className="py-1.5 text-right font-medium">{unitLabel}</th><th className="py-1.5 text-right font-medium">Share</th></tr></thead>
          <tbody className="tabular-nums">
            {data.map((d) => (
              <tr key={d.label} className="border-t border-line"><td className="py-1.5">{d.label}</td><td className="py-1.5 text-right">{d.count}</td><td className="py-1.5 text-right text-muted">{share(d.count, total)}</td></tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div id={tableId}>
          <ul aria-label={label} className="relative flex h-60 items-end gap-2 border-b border-line pt-8 sm:gap-3" data-chart="columns">
            {data.map((d, i) => {
              const h = (d.count / scaleMax) * 100;
              return (
                <li
                  key={d.label}
                  tabIndex={0}
                  aria-label={`${d.label}: ${d.count} ${unitLabel.toLowerCase()}, ${share(d.count, total)}`}
                  data-value={d.count}
                  className="group/col relative flex h-full flex-1 flex-col items-center justify-end rounded-t-[4px] outline-none focus-visible:outline-2 focus-visible:outline-lake"
                >
                  <span
                    role="presentation"
                    data-column-tip
                    className="pointer-events-none absolute z-10 mb-1 hidden rounded-sm bg-ink px-2 py-1 text-[11px] whitespace-nowrap text-paper group-hover/col:block group-focus-visible/col:block"
                    style={{ bottom: `calc(${h}% + 4px)` }}
                  >
                    {d.count} · {share(d.count, total)}
                  </span>
                  {i === busiest && <span aria-hidden className="mb-1 text-xs font-semibold text-ink tabular-nums group-hover/col:invisible group-focus-visible/col:invisible">{d.count}</span>}
                  <span
                    className="col-grow block w-full max-w-10 rounded-t-[4px] transition-[filter] group-hover/col:brightness-110"
                    style={{ height: `${d.count > 0 ? Math.max(h, 2) : 0}%`, background: SERIES, opacity: i === busiest ? 1 : 0.7, animationDelay: `${i * 40}ms` }}
                  />
                </li>
              );
            })}
          </ul>
          <ul aria-hidden className="mt-1.5 flex gap-2 text-center text-xs text-muted sm:gap-3">
            {data.map((d, i) => <li key={d.label} className={`flex-1 ${i === busiest ? "font-semibold text-ink" : ""}`}>{d.label}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

export function EmptyChart({ message }: { message: string }) {
  return (
    <div className="flex min-h-40 flex-col items-center justify-center rounded-sm border border-dashed border-line-strong bg-paper/50 px-6 py-8 text-center" data-chart="empty">
      <svg aria-hidden width="44" height="28" viewBox="0 0 44 28" fill="none" className="text-line-strong">
        <path d="M2 26h40M6 20l8-7 7 4 9-10 8 5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <p className="mt-3 text-sm text-muted">{message}</p>
    </div>
  );
}
