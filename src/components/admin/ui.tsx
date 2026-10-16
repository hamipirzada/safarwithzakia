import Link from "next/link";
import type { EmailStatus, EnquiryStatus, PublicationStatus } from "@/generated/prisma/enums";
import { STATUS_LABELS } from "@/domain/enquiry-status";

export function PageHeader({ title, description, actions, back }: { title: string; description?: string; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="inline-flex items-center gap-1 text-sm text-muted hover:text-ink">
            <span aria-hidden>←</span> {back.label}
          </Link>
        )}
        <h1 className="mt-1 text-[1.75rem] leading-tight font-normal text-ink">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

type Tone = "neutral" | "info" | "success" | "warning" | "danger" | "accent";
const TONES: Record<Tone, string> = {
  neutral: "bg-paper-deep text-ink-soft",
  info: "bg-lake-soft text-lake",
  success: "bg-success-soft text-success",
  warning: "bg-warning-soft text-warning",
  danger: "bg-danger-soft text-danger",
  accent: "bg-saffron-soft text-saffron-ink",
};

export function Badge({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap ${TONES[tone]}`}>
      <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />
      {children}
    </span>
  );
}

const ENQUIRY_TONES: Record<EnquiryStatus, Tone> = {
  NEW: "accent",
  CONTACTED: "info",
  QUOTE_PREPARATION: "info",
  QUOTE_SENT: "warning",
  CONFIRMED: "success",
  CLOSED: "neutral",
  SPAM: "danger",
};
export function EnquiryStatusBadge({ status }: { status: EnquiryStatus }) {
  return <Badge tone={ENQUIRY_TONES[status]}>{STATUS_LABELS[status]}</Badge>;
}

const EMAIL_LABELS: Record<EmailStatus, [string, Tone]> = {
  PENDING: ["Queued", "warning"],
  SENDING: ["Sending", "info"],
  SENT: ["Sent", "success"],
  FAILED: ["Failed", "danger"],
  CANCELLED: ["Cancelled", "neutral"],
};
export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  const [label, tone] = EMAIL_LABELS[status];
  return <Badge tone={tone}>{label}</Badge>;
}

const PUBLICATION: Record<PublicationStatus, [string, Tone]> = {
  DRAFT: ["Draft", "warning"],
  PUBLISHED: ["Published", "success"],
  ARCHIVED: ["Archived", "neutral"],
};
export function PublicationBadge({ status }: { status: PublicationStatus }) {
  const [label, tone] = PUBLICATION[status];
  return <Badge tone={tone}>{label}</Badge>;
}

export function EmptyState({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className="rounded-md border border-dashed border-line-strong bg-paper/40 px-6 py-10 text-center">
      <p className="font-medium text-ink">{title}</p>
      {children && <div className="mx-auto mt-1.5 max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className = "" }: { title?: string; description?: string; actions?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`min-w-0 rounded-md border border-line bg-surface shadow-[0_1px_2px_rgb(22_33_44/0.04)] ${className}`}>
      {title && (
        <header className="flex items-start justify-between gap-3 border-b border-line px-5 py-3.5">
          <div>
            <h2 className="font-sans text-sm font-semibold text-ink">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-muted">{description}</p>}
          </div>
          {actions}
        </header>
      )}
      <div className="p-5">{children}</div>
    </section>
  );
}

export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-md border border-line bg-surface shadow-[0_1px_2px_rgb(22_33_44/0.04)]">
      <table className="w-full min-w-[40rem] text-left text-sm [&_tbody_tr]:transition-colors [&_tbody_tr:hover]:bg-paper/60 [&_td]:border-t [&_td]:border-line [&_td]:px-4 [&_td]:py-3 [&_td]:align-top [&_th]:bg-paper/60 [&_th]:px-4 [&_th]:py-2.5 [&_th]:text-xs [&_th]:font-medium [&_th]:text-muted">
        {children}
      </table>
    </div>
  );
}

export function Pagination({ page, pageCount, makeHref }: { page: number; pageCount: number; makeHref: (page: number) => string }) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="mt-6 flex items-center justify-between text-sm">
      {page > 1 ? <Link className="btn btn-secondary btn-sm" href={makeHref(page - 1)}>Previous</Link> : <span />}
      <span className="text-muted">
        Page {page} of {pageCount}
      </span>
      {page < pageCount ? <Link className="btn btn-secondary btn-sm" href={makeHref(page + 1)}>Next</Link> : <span />}
    </nav>
  );
}

/** A tiny trend line for a stat tile (decorative: the tile's figure and the trend chart carry the data). */
export function Sparkline({ values, color = "#2a78d6" }: { values: number[]; color?: string }) {
  if (values.length < 2) return null;
  const w = 96;
  const h = 28;
  const max = Math.max(1, ...values);
  const pts = values.map((v, i) => [(i / (values.length - 1)) * w, h - 2 - (v / max) * (h - 4)] as const);
  const line = pts.map(([x, y], i) => `${i ? "L" : "M"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  return (
    <svg aria-hidden width={w} height={h} viewBox={`0 0 ${w} ${h}`} className="overflow-visible" data-sparkline>
      <path d={`${line} L${w},${h} L0,${h} Z`} fill={color} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={color} strokeWidth={1.5} strokeLinejoin="round" strokeLinecap="round" />
      <circle cx={pts.at(-1)![0]} cy={pts.at(-1)![1]} r={2.5} fill={color} />
    </svg>
  );
}

export function Stat({ label, sublabel, value, href, tone, testId, spark, footer }: { label: string; sublabel?: string; value: number | string; href?: string; tone?: "danger"; testId?: string; spark?: number[]; footer?: React.ReactNode }) {
  const body = (
    <>
      <p className="text-xs font-medium text-muted">
        {label}
        {sublabel && <span className="block font-normal text-faint">{sublabel}</span>}
      </p>
      <div className="mt-2 flex items-end justify-between gap-2">
        <p data-testid={testId} className={`text-[1.75rem] leading-none font-semibold tabular-nums ${tone === "danger" && value !== 0 ? "text-danger" : "text-ink"}`}>{value}</p>
        {spark && <Sparkline values={spark} />}
      </div>
      {footer && <div className="mt-2">{footer}</div>}
    </>
  );
  const cls = "block rounded-md border border-line bg-surface p-4 shadow-[0_1px_2px_rgb(22_33_44/0.04)]";
  return href ? (
    <Link href={href} className={`${cls} transition-[border-color,box-shadow,transform] hover:-translate-y-px hover:border-line-strong hover:shadow-[0_6px_16px_rgb(22_33_44/0.08)] focus-visible:outline-2 focus-visible:outline-lake motion-reduce:hover:translate-y-0`}>
      {body}
    </Link>
  ) : (
    <div className={cls}>{body}</div>
  );
}
