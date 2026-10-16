import { describe, expect, it } from "vitest";
import {
  amountForRule,
  estimateCustomTrip,
  estimatePackage,
  evaluatePromo,
  lowestRate,
  selectRule,
  type PromoRule,
  type RateRule,
} from "@/domain/pricing";

const NOW = new Date("2026-10-16T06:00:00Z");

function rule(overrides: Partial<RateRule> = {}): RateRule {
  return {
    id: overrides.id ?? "r1",
    label: "Standard",
    basis: "PER_PERSON_PER_DAY",
    amountPaise: 3500_00,
    childAmountPaise: null,
    includedTravellers: null,
    seasonStart: null,
    seasonEnd: null,
    validFrom: null,
    validTo: null,
    ...overrides,
  };
}

function promo(overrides: Partial<PromoRule> = {}): PromoRule {
  return { code: "SAVE10", discountType: "PERCENT", value: 10, minSubtotalPaise: null, maxDiscountPaise: null, validFrom: null, validTo: null, active: true, ...overrides };
}

describe("selectRule", () => {
  it("returns NO_RULE when there are no rules", () => {
    expect(selectRule([], "2026-11-01")).toEqual({ ok: false, reason: "NO_RULE" });
  });

  it("prefers a seasonal rule over an all-year rule on dates inside the season", () => {
    const allYear = rule({ id: "all" });
    const winter = rule({ id: "winter", seasonStart: "12-01", seasonEnd: "02-28" });
    expect(selectRule([allYear, winter], "2027-01-10")).toMatchObject({ ok: true, rule: { id: "winter" } });
    expect(selectRule([allYear, winter], "2026-11-10")).toMatchObject({ ok: true, rule: { id: "all" } });
  });

  it("handles seasons that wrap the year end", () => {
    const winter = rule({ id: "winter", seasonStart: "12-15", seasonEnd: "01-15" });
    expect(selectRule([winter], "2026-12-31").ok).toBe(true);
    expect(selectRule([winter], "2027-01-15").ok).toBe(true);
    expect(selectRule([winter], "2027-01-16")).toEqual({ ok: false, reason: "NO_RULE" });
  });

  it("respects validity windows", () => {
    const r = rule({ validFrom: "2026-11-01", validTo: "2026-11-30" });
    expect(selectRule([r], "2026-10-31")).toEqual({ ok: false, reason: "NO_RULE" });
    expect(selectRule([r], "2026-11-30").ok).toBe(true);
  });

  it("reports overlapping rules as ambiguous instead of guessing", () => {
    expect(selectRule([rule({ id: "a" }), rule({ id: "b" })], "2026-11-01")).toEqual({ ok: false, reason: "AMBIGUOUS" });
  });

  it("needs an exact date when seasonal or dated rules exist", () => {
    expect(selectRule([rule({ seasonStart: "06-01", seasonEnd: "08-31" })], null)).toEqual({ ok: false, reason: "DATE_REQUIRED" });
    expect(selectRule([rule({ validFrom: "2026-01-01" })], null)).toEqual({ ok: false, reason: "DATE_REQUIRED" });
    expect(selectRule([rule()], null)).toMatchObject({ ok: true });
  });
});

describe("amountForRule", () => {
  it("multiplies per-person-per-day rates by travellers and days", () => {
    const result = amountForRule(rule(), { adults: 2, children: 0 }, 3, "Srinagar");
    expect(result).toEqual({ ok: true, amountPaise: 2 * 3 * 3500_00, detail: "2 adults × 3 days" });
  });

  it("charges groups once per day regardless of size", () => {
    const result = amountForRule(rule({ basis: "PER_GROUP_PER_DAY", amountPaise: 4000_00 }), { adults: 5, children: 2 }, 2, "Cab");
    expect(result).toMatchObject({ ok: true, amountPaise: 8000_00 });
  });

  it("uses the child rate when one is published", () => {
    const result = amountForRule(rule({ childAmountPaise: 1000_00 }), { adults: 2, children: 1 }, 2, "X");
    expect(result).toMatchObject({ ok: true, amountPaise: (2 * 3500_00 + 1000_00) * 2 });
  });

  it("requires a quote when children travel and no child rate exists", () => {
    const result = amountForRule(rule(), { adults: 2, children: 1 }, 2, "Gulmarg");
    expect(result).toEqual({ ok: false, reason: "Child rates for Gulmarg have not been published." });
  });

  it("only applies package prices to the group size they cover", () => {
    const pkg = rule({ basis: "PER_PACKAGE", amountPaise: 18500_00, includedTravellers: 2 });
    expect(amountForRule(pkg, { adults: 2, children: 0 }, 5, "Honeymoon")).toMatchObject({ ok: true, amountPaise: 18500_00 });
    expect(amountForRule(pkg, { adults: 3, children: 0 }, 5, "Honeymoon").ok).toBe(false);
  });

  it("rejects fractional money", () => {
    expect(() => amountForRule(rule({ amountPaise: 10.5 }), { adults: 1, children: 0 }, 1, "X")).toThrow(RangeError);
  });
});

describe("evaluatePromo", () => {
  it("applies percentage discounts with rounding to the nearest paisa", () => {
    expect(evaluatePromo(promo({ value: 15 }), 999_99, NOW)).toEqual({ eligible: true, discountPaise: 15000 });
  });

  it("caps percentage discounts", () => {
    expect(evaluatePromo(promo({ maxDiscountPaise: 500_00 }), 100000_00, NOW)).toEqual({ eligible: true, discountPaise: 500_00 });
  });

  it("never discounts more than the subtotal", () => {
    expect(evaluatePromo(promo({ discountType: "FIXED", value: 5000_00 }), 3000_00, NOW)).toEqual({ eligible: true, discountPaise: 3000_00 });
  });

  it("rejects inactive, expired, not-yet-valid and below-minimum codes", () => {
    expect(evaluatePromo(promo({ active: false }), 10000_00, NOW).eligible).toBe(false);
    expect(evaluatePromo(promo({ validTo: new Date("2026-10-01") }), 10000_00, NOW)).toMatchObject({ eligible: false, message: "This promo code has expired." });
    expect(evaluatePromo(promo({ validFrom: new Date("2026-12-01") }), 10000_00, NOW)).toMatchObject({ eligible: false, message: "This promo code is not active yet." });
    expect(evaluatePromo(promo({ minSubtotalPaise: 20000_00 }), 10000_00, NOW).eligible).toBe(false);
    expect(evaluatePromo(null, 10000_00, NOW).eligible).toBe(false);
  });
});

describe("estimateCustomTrip", () => {
  const travellers = { adults: 2, children: 0 };

  it("sums each destination using its own published rate", () => {
    const estimate = estimateCustomTrip({
      legs: [
        { name: "Srinagar", days: 2, rules: [rule({ id: "s", amountPaise: 3500_00 })] },
        { name: "Gulmarg", days: 1, rules: [rule({ id: "g", amountPaise: 4500_00 })] },
      ],
      travellers,
      startDate: "2026-11-01",
      promoCode: null,
      promo: null,
      now: NOW,
    });
    expect(estimate).toMatchObject({ kind: "ESTIMATED", subtotalPaise: 2 * 2 * 3500_00 + 2 * 4500_00, totalPaise: 23000_00 });
  });

  it("prices each day by its season when a stay crosses a season boundary", () => {
    const estimate = estimateCustomTrip({
      legs: [{ name: "Gulmarg", days: 3, rules: [rule({ id: "base", amountPaise: 1000_00 }), rule({ id: "peak", label: "Peak", amountPaise: 2000_00, seasonStart: "12-01", seasonEnd: "12-31" })] }],
      travellers: { adults: 1, children: 0 },
      startDate: "2026-11-30",
      promoCode: null,
      promo: null,
      now: NOW,
    });
    expect(estimate.kind).toBe("ESTIMATED");
    if (estimate.kind !== "ESTIMATED") return;
    // 30 Nov at base rate, 1–2 Dec at peak rate
    expect(estimate.totalPaise).toBe(1000_00 + 2 * 2000_00);
    expect(estimate.lines).toHaveLength(2);
  });

  it("returns QUOTE_REQUIRED (never an invented price) when a destination has no rate", () => {
    const estimate = estimateCustomTrip({
      legs: [
        { name: "Srinagar", days: 2, rules: [rule()] },
        { name: "Sonmarg", days: 1, rules: [] },
      ],
      travellers,
      startDate: "2026-11-01",
      promoCode: null,
      promo: null,
      now: NOW,
    });
    expect(estimate).toEqual({ kind: "QUOTE_REQUIRED", currency: "INR", reasons: ["No published rate for Sonmarg on your dates."], promo: null });
  });

  it("applies a valid promo code to the subtotal", () => {
    const estimate = estimateCustomTrip({ legs: [{ name: "A", days: 1, rules: [rule({ amountPaise: 1000_00 })] }], travellers, startDate: "2026-11-01", promoCode: "save10", promo: promo(), now: NOW });
    expect(estimate).toMatchObject({ kind: "ESTIMATED", subtotalPaise: 2000_00, totalPaise: 1800_00, promo: { code: "SAVE10", applied: true, discountPaise: 200_00 } });
  });

  it("reports an unknown promo code without changing the total", () => {
    const estimate = estimateCustomTrip({ legs: [{ name: "A", days: 1, rules: [rule({ amountPaise: 1000_00 })] }], travellers, startDate: "2026-11-01", promoCode: "NOPE", promo: null, now: NOW });
    expect(estimate).toMatchObject({ kind: "ESTIMATED", totalPaise: 2000_00, promo: { applied: false } });
  });

  it("asks for exact dates when only a month is known and rates are seasonal", () => {
    const estimate = estimateCustomTrip({ legs: [{ name: "Gulmarg", days: 2, rules: [rule({ seasonStart: "12-01", seasonEnd: "02-28" })] }], travellers, startDate: null, promoCode: null, promo: null, now: NOW });
    expect(estimate.kind).toBe("QUOTE_REQUIRED");
  });

  it("never treats a per-package rate as a destination day rate", () => {
    const estimate = estimateCustomTrip({ legs: [{ name: "A", days: 2, rules: [rule({ basis: "PER_PACKAGE", includedTravellers: 2 })] }], travellers, startDate: "2026-11-01", promoCode: null, promo: null, now: NOW });
    expect(estimate.kind).toBe("QUOTE_REQUIRED");
  });
});

describe("estimatePackage", () => {
  const pkgRule = rule({ basis: "PER_PACKAGE", amountPaise: 18500_00, includedTravellers: 2 });

  it("uses the published package price for the covered group", () => {
    const estimate = estimatePackage({ packageTitle: "Honeymoon", durationDays: 5, rules: [pkgRule], addons: [], travellers: { adults: 2, children: 0 }, startDate: "2026-11-01", promoCode: null, promo: null, now: NOW });
    expect(estimate).toMatchObject({ kind: "ESTIMATED", totalPaise: 18500_00 });
  });

  it("adds add-ons by their basis and duration", () => {
    const estimate = estimatePackage({
      packageTitle: "Honeymoon",
      durationDays: 5,
      rules: [pkgRule],
      addons: [{ id: "a", name: "Candle-light dinner", basis: "PER_GROUP", amountPaise: 2500_00 }, { id: "b", name: "Guide", basis: "PER_GROUP_PER_DAY", amountPaise: 1000_00 }],
      travellers: { adults: 2, children: 0 },
      startDate: "2026-11-01",
      promoCode: null,
      promo: null,
      now: NOW,
    });
    expect(estimate).toMatchObject({ kind: "ESTIMATED", totalPaise: 18500_00 + 2500_00 + 5 * 1000_00 });
  });

  it("requires a quote for a different group size or per-person add-ons with children", () => {
    expect(estimatePackage({ packageTitle: "P", durationDays: 5, rules: [pkgRule], addons: [], travellers: { adults: 4, children: 0 }, startDate: null, promoCode: null, promo: null, now: NOW }).kind).toBe("QUOTE_REQUIRED");
    const withChild = estimatePackage({ packageTitle: "P", durationDays: 5, rules: [rule({ basis: "PER_PERSON", childAmountPaise: 500_00 })], addons: [{ id: "x", name: "Ski lesson", basis: "PER_PERSON", amountPaise: 1000_00 }], travellers: { adults: 2, children: 1 }, startDate: null, promoCode: null, promo: null, now: NOW });
    expect(withChild.kind).toBe("QUOTE_REQUIRED");
  });

  it("requires a quote when the package has no active price", () => {
    expect(estimatePackage({ packageTitle: "P", durationDays: 3, rules: [], addons: [], travellers: { adults: 2, children: 0 }, startDate: null, promoCode: null, promo: null, now: NOW }).kind).toBe("QUOTE_REQUIRED");
  });
});

describe("lowestRate", () => {
  it("only summarises rules that share a basis", () => {
    expect(lowestRate([rule({ id: "a", amountPaise: 5 }), rule({ id: "b", amountPaise: 3 })])?.id).toBe("b");
    expect(lowestRate([rule(), rule({ basis: "PER_GROUP_PER_DAY" })])).toBeNull();
    expect(lowestRate([])).toBeNull();
  });
});
