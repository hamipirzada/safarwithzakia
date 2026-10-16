/**
 * Trip pricing engine.
 *
 * Pure functions: callers load rules from the database and pass them in. The server is the
 * only place an estimate is trusted; the browser may display the same calculation as a preview,
 * but enquiries are always re-priced on the server at submission.
 *
 * Principles:
 *  - Every amount has an explicit basis (per person, per group, per day, per package).
 *  - Nothing is assumed. If a rate, child rate, season or date needed for a line is missing,
 *    the result is QUOTE_REQUIRED with human-readable reasons, never a guessed number.
 *  - Integer paise only.
 */

import { addDays, isWithinSeason, monthDay } from "./dates";
import { assertPaise } from "./money";

export type PricingBasis = "PER_PERSON" | "PER_GROUP" | "PER_PERSON_PER_DAY" | "PER_GROUP_PER_DAY" | "PER_PACKAGE";

export const BASIS_LABELS: Record<PricingBasis, string> = {
  PER_PERSON: "per person",
  PER_GROUP: "per group",
  PER_PERSON_PER_DAY: "per person, per day",
  PER_GROUP_PER_DAY: "per group, per day",
  PER_PACKAGE: "per package",
};

export interface RateRule {
  id: string;
  label: string;
  basis: PricingBasis;
  amountPaise: number;
  childAmountPaise: number | null;
  includedTravellers: number | null;
  /** "MM-DD", inclusive; both null for an all-year rule. */
  seasonStart: string | null;
  seasonEnd: string | null;
  /** YYYY-MM-DD, inclusive. */
  validFrom: string | null;
  validTo: string | null;
}

export interface PromoRule {
  code: string;
  discountType: "PERCENT" | "FIXED";
  value: number;
  minSubtotalPaise: number | null;
  maxDiscountPaise: number | null;
  validFrom: Date | null;
  validTo: Date | null;
  active: boolean;
}

export interface Travellers {
  adults: number;
  children: number;
}

export interface EstimateLine {
  label: string;
  detail: string;
  basis: PricingBasis;
  amountPaise: number;
}

export interface PromoOutcome {
  code: string;
  applied: boolean;
  discountPaise: number;
  message: string;
}

export type Estimate =
  | {
      kind: "ESTIMATED";
      currency: "INR";
      lines: EstimateLine[];
      subtotalPaise: number;
      promo: PromoOutcome | null;
      totalPaise: number;
    }
  | {
      kind: "QUOTE_REQUIRED";
      currency: "INR";
      reasons: string[];
      promo: PromoOutcome | null;
    };

// ─── Rule selection ──────────────────────────────────────────────────────────

function isRuleValidOn(rule: RateRule, isoDate: string): boolean {
  if (rule.validFrom && isoDate < rule.validFrom) return false;
  if (rule.validTo && isoDate > rule.validTo) return false;
  return true;
}

function isSeasonal(rule: RateRule): boolean {
  return rule.seasonStart !== null && rule.seasonEnd !== null;
}

export type RuleSelection =
  | { ok: true; rule: RateRule }
  | { ok: false; reason: "NO_RULE" | "AMBIGUOUS" | "DATE_REQUIRED" };

/**
 * Pick the rule that applies on a date. Seasonal rules win over all-year rules.
 * Two matching rules at the same precedence is a configuration error → AMBIGUOUS (quote required).
 * When the date is unknown, an answer is only possible if no seasonal rules exist.
 */
export function selectRule(rules: readonly RateRule[], isoDate: string | null): RuleSelection {
  if (rules.length === 0) return { ok: false, reason: "NO_RULE" };

  if (isoDate === null) {
    if (rules.some(isSeasonal) || rules.some((r) => r.validFrom || r.validTo)) {
      return { ok: false, reason: "DATE_REQUIRED" };
    }
    return rules.length === 1 ? { ok: true, rule: rules[0]! } : { ok: false, reason: "AMBIGUOUS" };
  }

  const valid = rules.filter((r) => isRuleValidOn(r, isoDate));
  const md = monthDay(isoDate);
  const seasonal = valid.filter((r) => isSeasonal(r) && isWithinSeason(md, r.seasonStart!, r.seasonEnd!));
  const candidates = seasonal.length > 0 ? seasonal : valid.filter((r) => !isSeasonal(r));

  if (candidates.length === 0) return { ok: false, reason: "NO_RULE" };
  if (candidates.length > 1) return { ok: false, reason: "AMBIGUOUS" };
  return { ok: true, rule: candidates[0]! };
}

// ─── Line amounts ────────────────────────────────────────────────────────────

type LineAmount = { ok: true; amountPaise: number; detail: string } | { ok: false; reason: string };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

/**
 * Amount for one rule applied to the travelling party for `days` days.
 * `subject` names what is being priced in error messages, e.g. "Gulmarg".
 */
export function amountForRule(rule: RateRule, travellers: Travellers, days: number, subject: string): LineAmount {
  assertPaise(rule.amountPaise);
  const { adults, children } = travellers;
  const perPerson = rule.basis === "PER_PERSON" || rule.basis === "PER_PERSON_PER_DAY";
  const perDay = rule.basis === "PER_PERSON_PER_DAY" || rule.basis === "PER_GROUP_PER_DAY";

  if (perPerson && children > 0 && rule.childAmountPaise === null) {
    return { ok: false, reason: `Child rates for ${subject} have not been published.` };
  }

  const dayFactor = perDay ? days : 1;
  const dayText = perDay ? ` × ${plural(days, "day")}` : "";

  switch (rule.basis) {
    case "PER_PERSON":
    case "PER_PERSON_PER_DAY": {
      const perDayTotal = adults * rule.amountPaise + children * (rule.childAmountPaise ?? 0);
      const party = children > 0 ? `${plural(adults, "adult")}, ${plural(children, "child")}` : plural(adults, "adult");
      return { ok: true, amountPaise: perDayTotal * dayFactor, detail: `${party}${dayText}` };
    }
    case "PER_GROUP":
    case "PER_GROUP_PER_DAY":
      return { ok: true, amountPaise: rule.amountPaise * dayFactor, detail: `Whole group${dayText}` };
    case "PER_PACKAGE": {
      const total = adults + children;
      if (rule.includedTravellers === null || total !== rule.includedTravellers) {
        return {
          ok: false,
          reason: `The published price for ${subject} covers ${plural(rule.includedTravellers ?? 0, "traveller")}; a different group size needs a quote.`,
        };
      }
      return { ok: true, amountPaise: rule.amountPaise, detail: `Package for ${plural(total, "traveller")}` };
    }
  }
}

// ─── Promo codes ─────────────────────────────────────────────────────────────

export function normalisePromoCode(code: string): string {
  return code.trim().toUpperCase();
}

export type PromoEligibility = { eligible: true; discountPaise: number } | { eligible: false; message: string };

export function evaluatePromo(promo: PromoRule | null, subtotalPaise: number, now: Date): PromoEligibility {
  if (!promo || !promo.active) return { eligible: false, message: "This promo code is not valid." };
  if (promo.validFrom && now < promo.validFrom) return { eligible: false, message: "This promo code is not active yet." };
  if (promo.validTo && now > promo.validTo) return { eligible: false, message: "This promo code has expired." };
  if (promo.minSubtotalPaise !== null && subtotalPaise < promo.minSubtotalPaise) {
    return { eligible: false, message: "Your trip does not meet the minimum amount for this code." };
  }

  let discount =
    promo.discountType === "PERCENT" ? Math.round((subtotalPaise * promo.value) / 100) : Math.min(promo.value, subtotalPaise);
  if (promo.maxDiscountPaise !== null) discount = Math.min(discount, promo.maxDiscountPaise);
  return { eligible: true, discountPaise: Math.max(0, discount) };
}

function finalise(
  lines: EstimateLine[],
  reasons: string[],
  promoCode: string | null,
  promo: PromoRule | null,
  now: Date,
): Estimate {
  const code = promoCode ? normalisePromoCode(promoCode) : null;

  if (reasons.length > 0) {
    let promoOutcome: PromoOutcome | null = null;
    if (code) {
      const known = promo !== null && promo.active;
      promoOutcome = {
        code,
        applied: false,
        discountPaise: 0,
        message: known
          ? "We will apply this code, if eligible, when we prepare your quote."
          : "This promo code is not valid.",
      };
    }
    return { kind: "QUOTE_REQUIRED", currency: "INR", reasons: [...new Set(reasons)], promo: promoOutcome };
  }

  const subtotalPaise = lines.reduce((sum, line) => sum + line.amountPaise, 0);
  let promoOutcome: PromoOutcome | null = null;
  let discount = 0;
  if (code) {
    const eligibility = evaluatePromo(promo, subtotalPaise, now);
    if (eligibility.eligible) {
      discount = eligibility.discountPaise;
      promoOutcome = { code, applied: true, discountPaise: discount, message: "Promo code applied." };
    } else {
      promoOutcome = { code, applied: false, discountPaise: 0, message: eligibility.message };
    }
  }

  return {
    kind: "ESTIMATED",
    currency: "INR",
    lines,
    subtotalPaise,
    promo: promoOutcome,
    totalPaise: subtotalPaise - discount,
  };
}

function selectionReason(reason: "NO_RULE" | "AMBIGUOUS" | "DATE_REQUIRED", subject: string): string {
  switch (reason) {
    case "NO_RULE":
      return `No published rate for ${subject} on your dates.`;
    case "AMBIGUOUS":
      return `Rates for ${subject} need confirming by our team.`;
    case "DATE_REQUIRED":
      return `Rates for ${subject} vary by date, so an exact start date is needed.`;
  }
}

// ─── Custom trip ─────────────────────────────────────────────────────────────

export interface TripLeg {
  name: string;
  days: number;
  rules: readonly RateRule[];
}

export interface CustomTripPricingInput {
  legs: readonly TripLeg[];
  travellers: Travellers;
  /** Exact first day of travel, or null when only a month/flexible period is known. */
  startDate: string | null;
  promoCode: string | null;
  promo: PromoRule | null;
  now: Date;
}

/**
 * Prices each day of each destination with the rule applicable on that calendar day, so a
 * stay that crosses a season boundary is priced correctly. Legs run in the order given.
 */
export function estimateCustomTrip(input: CustomTripPricingInput): Estimate {
  const reasons: string[] = [];
  const lines: EstimateLine[] = [];
  let dayOffset = 0;

  for (const leg of input.legs) {
    // Group consecutive days that share a rule into one line.
    const segments: { rule: RateRule; days: number }[] = [];
    for (let d = 0; d < leg.days; d++) {
      const date = input.startDate ? addDays(input.startDate, dayOffset + d) : null;
      const selection = selectRule(leg.rules, date);
      if (!selection.ok) {
        reasons.push(selectionReason(selection.reason, leg.name));
        break;
      }
      const last = segments.at(-1);
      if (last && last.rule.id === selection.rule.id) last.days++;
      else segments.push({ rule: selection.rule, days: 1 });
    }
    dayOffset += leg.days;
    if (segments.reduce((n, s) => n + s.days, 0) !== leg.days) continue;

    for (const segment of segments) {
      if (segment.rule.basis === "PER_PACKAGE") {
        reasons.push(`Rates for ${leg.name} need confirming by our team.`);
        continue;
      }
      const amount = amountForRule(segment.rule, input.travellers, segment.days, leg.name);
      if (!amount.ok) {
        reasons.push(amount.reason);
        continue;
      }
      lines.push({
        label: segments.length > 1 ? `${leg.name} — ${segment.rule.label}` : leg.name,
        detail: amount.detail,
        basis: segment.rule.basis,
        amountPaise: amount.amountPaise,
      });
    }
  }

  return finalise(lines, reasons, input.promoCode, input.promo, input.now);
}

// ─── Package ─────────────────────────────────────────────────────────────────

export interface AddonRule {
  id: string;
  name: string;
  basis: PricingBasis;
  amountPaise: number;
}

export interface PackagePricingInput {
  packageTitle: string;
  durationDays: number;
  rules: readonly RateRule[];
  addons: readonly AddonRule[];
  travellers: Travellers;
  startDate: string | null;
  promoCode: string | null;
  promo: PromoRule | null;
  now: Date;
}

export function estimatePackage(input: PackagePricingInput): Estimate {
  const reasons: string[] = [];
  const lines: EstimateLine[] = [];

  const selection = selectRule(input.rules, input.startDate);
  if (!selection.ok) {
    reasons.push(selectionReason(selection.reason, input.packageTitle));
  } else {
    const amount = amountForRule(selection.rule, input.travellers, input.durationDays, input.packageTitle);
    if (amount.ok) {
      lines.push({ label: input.packageTitle, detail: amount.detail, basis: selection.rule.basis, amountPaise: amount.amountPaise });
    } else {
      reasons.push(amount.reason);
    }
  }

  for (const addon of input.addons) {
    if (addon.basis === "PER_PACKAGE") {
      reasons.push(`The add-on "${addon.name}" needs confirming by our team.`);
      continue;
    }
    const amount = amountForRule(
      // Add-ons have no child rate, so per-person add-ons with children travelling need a quote.
      {
        id: addon.id,
        label: addon.name,
        basis: addon.basis,
        amountPaise: addon.amountPaise,
        childAmountPaise: null,
        includedTravellers: null,
        seasonStart: null,
        seasonEnd: null,
        validFrom: null,
        validTo: null,
      },
      input.travellers,
      input.durationDays,
      addon.name,
    );
    if (amount.ok) lines.push({ label: `Add-on: ${addon.name}`, detail: amount.detail, basis: addon.basis, amountPaise: amount.amountPaise });
    else reasons.push(amount.reason);
  }

  return finalise(lines, reasons, input.promoCode, input.promo, input.now);
}

/** Lowest published adult amount for "From ₹X per person, per day" style labels. */
export function lowestRate(rules: readonly RateRule[]): RateRule | null {
  if (rules.length === 0) return null;
  const bases = new Set(rules.map((r) => r.basis));
  // Only compare like with like; mixed bases cannot be summarised as one "from" price.
  if (bases.size > 1) return null;
  return rules.reduce((min, r) => (r.amountPaise < min.amountPaise ? r : min));
}
