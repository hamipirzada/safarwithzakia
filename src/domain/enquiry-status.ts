import type { EnquiryStatus } from "@/generated/prisma/enums";

export const ENQUIRY_STATUSES = [
  "NEW",
  "CONTACTED",
  "QUOTE_PREPARATION",
  "QUOTE_SENT",
  "CONFIRMED",
  "CLOSED",
  "SPAM",
] as const satisfies readonly EnquiryStatus[];

export const STATUS_LABELS: Record<EnquiryStatus, string> = {
  NEW: "New",
  CONTACTED: "Contacted",
  QUOTE_PREPARATION: "Quote preparation",
  QUOTE_SENT: "Quote sent",
  CONFIRMED: "Confirmed",
  CLOSED: "Closed",
  SPAM: "Spam",
};

/**
 * Allowed transitions. "Confirmed" means the customer accepted the quote; it is not a
 * payment-confirmed booking (no booking or payment workflow exists in this system).
 */
const TRANSITIONS: Record<EnquiryStatus, readonly EnquiryStatus[]> = {
  NEW: ["CONTACTED", "QUOTE_PREPARATION", "CLOSED", "SPAM"],
  CONTACTED: ["QUOTE_PREPARATION", "QUOTE_SENT", "CLOSED", "SPAM"],
  QUOTE_PREPARATION: ["QUOTE_SENT", "CONTACTED", "CLOSED"],
  QUOTE_SENT: ["CONFIRMED", "QUOTE_PREPARATION", "CLOSED"],
  CONFIRMED: ["CLOSED"],
  CLOSED: ["CONTACTED"],
  SPAM: ["NEW"],
};

export function allowedTransitions(from: EnquiryStatus): readonly EnquiryStatus[] {
  return TRANSITIONS[from];
}

export function canTransition(from: EnquiryStatus, to: EnquiryStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

/** Statuses that still need staff attention. */
export const OPEN_STATUSES: readonly EnquiryStatus[] = ["NEW", "CONTACTED", "QUOTE_PREPARATION", "QUOTE_SENT"];
