/**
 * Money is represented everywhere as an integer number of paise (INR minor units).
 * Never use floating point rupees for arithmetic.
 */

export const CURRENCY = "INR" as const;

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: CURRENCY,
  maximumFractionDigits: 0,
  minimumFractionDigits: 0,
});

const inrFormatterPaise = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: CURRENCY,
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

export function assertPaise(value: number): void {
  if (!Number.isSafeInteger(value)) {
    throw new RangeError(`Money values must be whole paise, received ${value}`);
  }
}

/** ₹18,500 for whole-rupee amounts, ₹18,500.50 otherwise. */
export function formatINR(paise: number): string {
  assertPaise(paise);
  return paise % 100 === 0 ? inrFormatter.format(paise / 100) : inrFormatterPaise.format(paise / 100);
}

/**
 * Parse a rupee amount typed by staff ("18500", "18,500.50", "₹ 3,500") into paise.
 * Returns null for anything that is not a non-negative amount with at most two decimals.
 */
export function parseRupeesToPaise(input: string): number | null {
  const cleaned = input.replace(/[₹,\s]/g, "");
  if (!/^\d{1,9}(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, fraction = ""] = cleaned.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}

/** Plain rupee string for form inputs ("18500" or "18500.50"). */
export function paiseToRupeeInput(paise: number): string {
  assertPaise(paise);
  const rupees = Math.trunc(paise / 100);
  const rest = paise % 100;
  return rest === 0 ? String(rupees) : `${rupees}.${String(rest).padStart(2, "0")}`;
}
