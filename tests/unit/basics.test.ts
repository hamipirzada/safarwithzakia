import { describe, expect, it } from "vitest";
import { addDays, addMonthsToMonth, isIsoDate, isIsoMonth, isWithinSeason, todayInBusinessZone } from "@/domain/dates";
import { allowedTransitions, canTransition, ENQUIRY_STATUSES } from "@/domain/enquiry-status";
import { formatINR, paiseToRupeeInput, parseRupeesToPaise } from "@/domain/money";
import { generateEnquiryReference, normaliseReference, REFERENCE_PATTERN } from "@/domain/reference";
import { isValidSlug, slugify } from "@/domain/slug";

describe("dates", () => {
  it("validates real calendar dates only", () => {
    expect(isIsoDate("2026-02-28")).toBe(true);
    expect(isIsoDate("2026-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(isIsoDate("2026-13-01")).toBe(false);
    expect(isIsoDate("26-01-01")).toBe(false);
    expect(isIsoMonth("2026-12")).toBe(true);
    expect(isIsoMonth("2026-00")).toBe(false);
  });

  it("evaluates 'today' in India, not UTC", () => {
    // 20:00 UTC on 31 Dec is already 1 Jan in IST (UTC+5:30).
    expect(todayInBusinessZone(new Date("2026-12-31T20:00:00Z"))).toBe("2027-01-01");
    expect(todayInBusinessZone(new Date("2026-12-31T18:00:00Z"))).toBe("2026-12-31");
  });

  it("adds days and months across boundaries", () => {
    expect(addDays("2026-12-30", 3)).toBe("2027-01-02");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addMonthsToMonth("2026-11", 24)).toBe("2028-11");
  });

  it("checks inclusive and wrapping seasons", () => {
    expect(isWithinSeason("06-15", "06-01", "08-31")).toBe(true);
    expect(isWithinSeason("09-01", "06-01", "08-31")).toBe(false);
    expect(isWithinSeason("01-05", "12-15", "01-15")).toBe(true);
  });
});

describe("money", () => {
  it("formats paise as Indian rupees", () => {
    expect(formatINR(18_500_00)).toBe("₹18,500");
    expect(formatINR(1_00_000_00)).toBe("₹1,00,000");
    expect(formatINR(350_50)).toBe("₹350.50");
  });

  it("parses staff-entered rupee amounts strictly", () => {
    expect(parseRupeesToPaise("18500")).toBe(18_500_00);
    expect(parseRupeesToPaise("₹ 18,500.5")).toBe(18_500_50);
    expect(parseRupeesToPaise("0.05")).toBe(5);
    expect(parseRupeesToPaise("-10")).toBeNull();
    expect(parseRupeesToPaise("1.234")).toBeNull();
    expect(parseRupeesToPaise("abc")).toBeNull();
    expect(paiseToRupeeInput(18_500_50)).toBe("18500.50");
    expect(paiseToRupeeInput(18_500_00)).toBe("18500");
  });
});

describe("slugs", () => {
  it("creates readable slugs", () => {
    expect(slugify("Srinagar – Dal Lake")).toBe("srinagar-dal-lake");
    expect(slugify("  Gulmarg & Sonmarg!! ")).toBe("gulmarg-and-sonmarg");
    expect(slugify("Café Pahalgām")).toBe("cafe-pahalgam");
    expect(isValidSlug("kashmir-honeymoon")).toBe(true);
    expect(isValidSlug("Kashmir Honeymoon")).toBe(false);
    expect(isValidSlug("-bad-")).toBe(false);
  });
});

describe("enquiry references", () => {
  it("uses the prefix, submission month and unambiguous characters", () => {
    const ref = generateEnquiryReference(new Date("2026-10-16T00:00:00Z"), () => new Uint8Array([0, 31, 18, 255, 64]));
    expect(ref).toBe("SWZ-2610-0ZJZ0");
    expect(REFERENCE_PATTERN.test(ref)).toBe(true);
  });

  it("produces valid references from real randomness", () => {
    for (let i = 0; i < 200; i++) expect(REFERENCE_PATTERN.test(generateEnquiryReference(new Date()))).toBe(true);
  });

  it("normalises references typed by customers", () => {
    expect(normaliseReference(" swz-2610-7k3qo ")).toBe("SWZ-2610-7K3Q0");
    expect(normaliseReference("SWZ-2610-1L1I0")).toBe("SWZ-2610-11110");
  });
});

describe("enquiry status transitions", () => {
  it("allows the normal sales flow", () => {
    expect(canTransition("NEW", "CONTACTED")).toBe(true);
    expect(canTransition("CONTACTED", "QUOTE_PREPARATION")).toBe(true);
    expect(canTransition("QUOTE_PREPARATION", "QUOTE_SENT")).toBe(true);
    expect(canTransition("QUOTE_SENT", "CONFIRMED")).toBe(true);
    expect(canTransition("CONFIRMED", "CLOSED")).toBe(true);
  });

  it("blocks skipping to confirmed and leaving terminal states incorrectly", () => {
    expect(canTransition("NEW", "CONFIRMED")).toBe(false);
    expect(canTransition("CONFIRMED", "NEW")).toBe(false);
    expect(canTransition("SPAM", "CONFIRMED")).toBe(false);
    expect(canTransition("SPAM", "NEW")).toBe(true);
    expect(canTransition("CLOSED", "CONTACTED")).toBe(true);
  });

  it("never lists a status as a transition to itself", () => {
    for (const s of ENQUIRY_STATUSES) expect(allowedTransitions(s)).not.toContain(s);
  });
});
