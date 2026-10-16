/**
 * Email templates. Each returns a subject plus HTML and plain-text bodies.
 * All dynamic values go through `escapeHtml` in HTML output; nothing user-provided is
 * ever interpreted as markup. Layout uses tables and inline styles for email clients.
 */

import { formatDateTime } from "@/domain/dates";
import { formatINR } from "@/domain/money";
import type { Estimate } from "@/domain/pricing";

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Escape and keep line breaks. */
function escapeMultiline(value: string): string {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

/** Strip characters that could break a subject line. */
function subjectSafe(value: string): string {
  return value.replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
}

const INK = "#14202e";
const MUTED = "#5b6573";
const RULE = "#e4ddd0";
const ACCENT = "#9a6a12";

function layout(opts: { businessName: string; preheader: string; body: string }): string {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(opts.businessName)}</title></head>
<body style="margin:0;padding:0;background:#f5f1ea;color:${INK};font-family:Arial,Helvetica,sans-serif;">
<span style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(opts.preheader)}</span>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f1ea;padding:24px 12px;">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border:1px solid ${RULE};border-radius:6px;">
<tr><td style="padding:22px 28px;border-bottom:1px solid ${RULE};font-family:Georgia,'Times New Roman',serif;font-size:20px;color:${INK};">${escapeHtml(opts.businessName)}</td></tr>
<tr><td style="padding:24px 28px;font-size:15px;line-height:1.55;">${opts.body}</td></tr>
</table>
</td></tr></table>
</body></html>`;
}

function row(label: string, valueHtml: string): string {
  return `<tr><td style="padding:7px 12px 7px 0;color:${MUTED};font-size:13px;vertical-align:top;white-space:nowrap;">${escapeHtml(label)}</td><td style="padding:7px 0;font-size:14px;vertical-align:top;">${valueHtml}</td></tr>`;
}

function detailsTable(rows: [string, string | null | undefined][]): { html: string; text: string } {
  const present = rows.filter((r): r is [string, string] => Boolean(r[1]));
  return {
    html: `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;border-top:1px solid ${RULE};border-bottom:1px solid ${RULE};margin:16px 0;">${present
      .map(([l, v]) => row(l, escapeMultiline(v)))
      .join("")}</table>`,
    text: present.map(([l, v]) => `${l}: ${v}`).join("\n"),
  };
}

function button(href: string, label: string): string {
  return `<p style="margin:22px 0 4px;"><a href="${escapeHtml(href)}" style="display:inline-block;background:${INK};color:#ffffff;text-decoration:none;padding:11px 18px;border-radius:4px;font-size:14px;">${escapeHtml(label)}</a></p>`;
}

// ─── Enquiry data ────────────────────────────────────────────────────────────

export interface EnquiryEmailData {
  businessName: string;
  reference: string;
  type: "CONTACT" | "PACKAGE" | "CUSTOM_TRIP";
  submittedAt: Date;
  customerName: string;
  email: string;
  phone: string | null;
  message: string | null;
  packageTitle: string | null;
  destinations: { name: string; days: number }[];
  /** Already formatted, e.g. "12 November 2026" or "November 2026 (flexible)". */
  travelDates: string | null;
  durationDays: number | null;
  adults: number | null;
  children: number | null;
  accommodation: string | null;
  transport: string | null;
  interests: string[];
  addons: string[];
  budget: string | null;
  promoCode: string | null;
  estimate: Estimate | null;
  /** Absolute link to the admin record, when APP_URL is configured. */
  adminUrl: string | null;
}

const TYPE_LABELS: Record<EnquiryEmailData["type"], string> = {
  CONTACT: "Contact enquiry",
  PACKAGE: "Package enquiry",
  CUSTOM_TRIP: "Custom trip request",
};

function travellersText(d: EnquiryEmailData): string | null {
  if (d.adults === null) return null;
  const adults = `${d.adults} adult${d.adults === 1 ? "" : "s"}`;
  return d.children ? `${adults}, ${d.children} child${d.children === 1 ? "" : "ren"}` : adults;
}

function routeText(d: EnquiryEmailData): string | null {
  if (d.destinations.length === 0) return null;
  return d.destinations.map((x) => `${x.name} (${x.days} day${x.days === 1 ? "" : "s"})`).join(" → ");
}

function estimateText(estimate: Estimate | null): string | null {
  if (!estimate) return null;
  if (estimate.kind === "QUOTE_REQUIRED") return `Quote required — ${estimate.reasons.join(" ")}`;
  const promo = estimate.promo?.applied ? ` (after ${estimate.promo.code}: −${formatINR(estimate.promo.discountPaise)})` : "";
  return `${formatINR(estimate.totalPaise)} indicative estimate${promo}. Not a confirmed quotation.`;
}

function enquiryRows(d: EnquiryEmailData): [string, string | null | undefined][] {
  return [
    ["Reference", d.reference],
    ["Received", formatDateTime(d.submittedAt)],
    ["Type", TYPE_LABELS[d.type]],
    ["Name", d.customerName],
    ["Email", d.email],
    ["Phone", d.phone],
    ["Package", d.packageTitle],
    ["Destinations", routeText(d)],
    ["Travel dates", d.travelDates],
    ["Duration", d.durationDays ? `${d.durationDays} day${d.durationDays === 1 ? "" : "s"}` : null],
    ["Travellers", travellersText(d)],
    ["Accommodation", d.accommodation],
    ["Transport", d.transport],
    ["Interests", d.interests.length ? d.interests.join(", ") : null],
    ["Add-ons", d.addons.length ? d.addons.join(", ") : null],
    ["Budget", d.budget],
    ["Promo code", d.promoCode],
    ["Estimate", estimateText(d.estimate)],
    ["Message", d.message],
  ];
}

export function renderInternalEnquiry(d: EnquiryEmailData): RenderedEmail {
  const details = detailsTable(enquiryRows(d));
  const subject = `New ${TYPE_LABELS[d.type].toLowerCase()} ${d.reference} — ${subjectSafe(d.customerName)}`;
  const intro = `A new ${TYPE_LABELS[d.type].toLowerCase()} was submitted on the website. Reply to this email to answer the customer directly.`;
  const html = layout({
    businessName: d.businessName,
    preheader: `${d.reference} from ${d.customerName}`,
    body: `<p style="margin:0 0 6px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:${ACCENT};">${escapeHtml(TYPE_LABELS[d.type])}</p>
<h1 style="margin:0 0 10px;font-family:Georgia,'Times New Roman',serif;font-weight:normal;font-size:24px;">${escapeHtml(d.reference)}</h1>
<p style="margin:0;color:${MUTED};">${escapeHtml(intro)}</p>
${details.html}
${d.adminUrl ? button(d.adminUrl, "Open in admin") : ""}`,
  });
  const text = `${intro}\n\n${details.text}\n${d.adminUrl ? `\nOpen in admin: ${d.adminUrl}\n` : ""}`;
  return { subject, html, text };
}

export function renderCustomerAcknowledgement(
  d: EnquiryEmailData & { contactPhone: string | null; whatsappUrl: string | null },
): RenderedEmail {
  const first = d.customerName.split(/\s+/)[0] ?? d.customerName;
  const summaryRows: [string, string | null | undefined][] = [
    ["Reference", d.reference],
    ["Package", d.packageTitle],
    ["Destinations", routeText(d)],
    ["Travel dates", d.travelDates],
    ["Travellers", travellersText(d)],
    ["Estimate", d.estimate?.kind === "ESTIMATED" ? `${formatINR(d.estimate.totalPaise)} (indicative, not a confirmed quotation)` : null],
  ];
  const details = detailsTable(summaryRows);
  const paragraphs = [
    `Thank you for getting in touch. We have received your ${TYPE_LABELS[d.type].toLowerCase()} and a member of our team will reply personally.`,
    "This email confirms that we received your enquiry. It is not a booking: nothing is reserved and no payment is due until we have agreed a plan and a quote with you.",
  ];
  const contact = [
    d.contactPhone ? `Phone: ${d.contactPhone}` : null,
    d.whatsappUrl ? `WhatsApp: ${d.whatsappUrl}` : null,
  ].filter(Boolean) as string[];
  const subject = `We received your enquiry (${d.reference})`;
  const html = layout({
    businessName: d.businessName,
    preheader: `Your reference is ${d.reference}`,
    body: `<p style="margin:0 0 14px;">Dear ${escapeHtml(first)},</p>
${paragraphs.map((p) => `<p style="margin:0 0 14px;">${escapeHtml(p)}</p>`).join("")}
${details.html}
<p style="margin:0 0 6px;color:${MUTED};font-size:14px;">Please quote <strong>${escapeHtml(d.reference)}</strong> if you contact us about this enquiry.</p>
${contact.length ? `<p style="margin:0;color:${MUTED};font-size:14px;">${contact.map(escapeHtml).join("<br>")}</p>` : ""}
<p style="margin:18px 0 0;">Warm regards,<br>${escapeHtml(d.businessName)}</p>`,
  });
  const text = `Dear ${first},\n\n${paragraphs.join("\n\n")}\n\n${details.text}\n\nPlease quote ${d.reference} if you contact us about this enquiry.\n${contact.join("\n")}\n\nWarm regards,\n${d.businessName}\n`;
  return { subject, html, text };
}

export function renderPasswordReset(opts: { businessName: string; name: string; url: string; expiresMinutes: number }): RenderedEmail {
  const lines = [
    `Someone asked to reset the password for your ${opts.businessName} admin account.`,
    `Use the link below within ${opts.expiresMinutes} minutes. If you did not ask for this, you can ignore this email; your password will not change.`,
  ];
  return {
    subject: `Reset your ${opts.businessName} admin password`,
    html: layout({
      businessName: opts.businessName,
      preheader: "Password reset link",
      body: `<p style="margin:0 0 14px;">Hello ${escapeHtml(opts.name)},</p>${lines.map((l) => `<p style="margin:0 0 14px;">${escapeHtml(l)}</p>`).join("")}${button(opts.url, "Choose a new password")}`,
    }),
    text: `Hello ${opts.name},\n\n${lines.join("\n\n")}\n\n${opts.url}\n`,
  };
}

export function renderDeliveryFailureAlert(opts: {
  businessName: string;
  reference: string | null;
  failedKind: string;
  errorCode: string | null;
  adminUrl: string | null;
}): RenderedEmail {
  const line = `An email (${opts.failedKind.toLowerCase().replace(/_/g, " ")}) for ${opts.reference ?? "an enquiry"} could not be delivered${opts.errorCode ? ` (error: ${opts.errorCode})` : ""}. The enquiry itself is saved. Please check the address and contact the customer another way if needed.`;
  return {
    subject: `Email delivery failed${opts.reference ? ` for ${opts.reference}` : ""}`,
    html: layout({
      businessName: opts.businessName,
      preheader: "An email could not be delivered",
      body: `<p style="margin:0 0 14px;">${escapeHtml(line)}</p>${opts.adminUrl ? button(opts.adminUrl, "Review in admin") : ""}`,
    }),
    text: `${line}\n${opts.adminUrl ? `\n${opts.adminUrl}\n` : ""}`,
  };
}

export function renderTestEmail(opts: { businessName: string; sentBy: string; at: Date }): RenderedEmail {
  const line = `This is a test message sent from the ${opts.businessName} admin by ${opts.sentBy} at ${formatDateTime(opts.at)}. If you can read this, Gmail delivery is working.`;
  return {
    subject: `${opts.businessName}: test email`,
    html: layout({ businessName: opts.businessName, preheader: "Gmail delivery test", body: `<p style="margin:0;">${escapeHtml(line)}</p>` }),
    text: `${line}\n`,
  };
}
