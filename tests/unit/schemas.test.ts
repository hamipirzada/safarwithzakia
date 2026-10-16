import { describe, expect, it } from "vitest";
import { contactSchema, customTripSchema, fieldErrors, packageEnquirySchema, tripEstimateSchema } from "@/domain/schemas";
import { destinationInput, packageInput } from "@/domain/admin-schemas";

const TODAY = "2026-10-16";
const DEST = "11111111-1111-4111-8111-111111111111";

const trip = (overrides: Record<string, unknown> = {}) => ({
  legs: [{ destinationId: DEST, days: 2 }],
  dateMode: "exact",
  startDate: "2026-11-10",
  travelMonth: "",
  adults: 2,
  children: 0,
  name: "Asha Rao",
  email: "Asha@Example.com",
  phone: "+91 98765 43210",
  consent: true,
  ...overrides,
});

function errorsOf(result: { success: boolean; error?: unknown }) {
  return result.success ? {} : fieldErrors(result.error as never);
}

describe("contact form validation", () => {
  it("accepts a valid message and normalises the email", () => {
    const parsed = contactSchema.parse({ name: "Asha", email: " ASHA@example.com ", message: "We would like to visit in May.", consent: true });
    expect(parsed.email).toBe("asha@example.com");
  });

  it("requires consent, a real email and a meaningful message", () => {
    const errors = errorsOf(contactSchema.safeParse({ name: "A", email: "nope", message: "hi", consent: false }));
    expect(Object.keys(errors).sort()).toEqual(["consent", "email", "message", "name"]);
  });

  it("rejects header-injection attempts in single-line fields", () => {
    const errors = errorsOf(contactSchema.safeParse({ name: "Eve\r\nBcc: victim@example.com", email: "eve@example.com", message: "Hello there friend", consent: true }));
    expect(errors.name).toBeDefined();
    expect(contactSchema.safeParse({ name: "Eve", email: "eve@example.com\nbcc:x@y.z", message: "Hello there friend", consent: true }).success).toBe(false);
  });

  it("strips control characters from multi-line messages but keeps line breaks", () => {
    const parsed = contactSchema.parse({ name: "Asha", email: "a@example.com", message: "Line one\nLine two\u0007", consent: true });
    expect(parsed.message).toBe("Line one\nLine two");
  });
});

describe("custom trip validation", () => {
  const schema = customTripSchema(TODAY);

  it("accepts a complete trip", () => {
    expect(schema.safeParse(trip()).success).toBe(true);
  });

  it("rejects past dates, impossible dates and dates too far ahead", () => {
    expect(errorsOf(schema.safeParse(trip({ startDate: "2026-10-15" }))).startDate).toMatch(/past/);
    expect(errorsOf(schema.safeParse(trip({ startDate: "2026-02-30" }))).startDate).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ startDate: "2029-01-01" }))).startDate).toBeDefined();
    expect(schema.safeParse(trip({ startDate: TODAY })).success).toBe(true);
  });

  it("validates month-only travel", () => {
    expect(schema.safeParse(trip({ dateMode: "month", startDate: "", travelMonth: "2026-12" })).success).toBe(true);
    expect(errorsOf(schema.safeParse(trip({ dateMode: "month", startDate: "", travelMonth: "2026-09" }))).travelMonth).toBeDefined();
  });

  it("enforces traveller limits", () => {
    expect(errorsOf(schema.safeParse(trip({ adults: 0 }))).adults).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ adults: 21 }))).adults).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ children: -1 }))).children).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ adults: 2.5 }))).adults).toBeDefined();
  });

  it("validates destinations and total duration", () => {
    expect(errorsOf(schema.safeParse(trip({ legs: [] }))).legs).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ legs: [{ destinationId: "x", days: 2 }] })))["legs.0.destinationId"]).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ legs: [{ destinationId: DEST, days: 0 }] })))["legs.0.days"]).toBeDefined();
    expect(errorsOf(schema.safeParse(trip({ legs: [{ destinationId: DEST, days: 20 }, { destinationId: DEST, days: 15 }] }))).legs).toMatch(/30 days/);
  });

  it("requires a phone number for trip requests", () => {
    expect(errorsOf(schema.safeParse(trip({ phone: "" }))).phone).toBeDefined();
  });

  it("rejects unknown preference values", () => {
    expect(schema.safeParse(trip({ accommodation: "palace" })).success).toBe(false);
    expect(schema.safeParse(trip({ interests: ["snow", "skydiving"] })).success).toBe(false);
  });

  it("estimate schema needs only route, dates and travellers", () => {
    expect(tripEstimateSchema(TODAY).safeParse({ legs: [{ destinationId: DEST, days: 1 }], dateMode: "exact", startDate: "2026-11-01", adults: 1, children: 0 }).success).toBe(true);
  });
});

describe("package enquiry validation", () => {
  it("requires a package id and validates add-on ids", () => {
    const base = { ...trip(), packageId: DEST, addonIds: [] };
    expect(packageEnquirySchema(TODAY).safeParse(base).success).toBe(true);
    expect(packageEnquirySchema(TODAY).safeParse({ ...base, addonIds: ["bad"] }).success).toBe(false);
  });
});

describe("admin catalogue validation", () => {
  const pkg = { title: "Trip", slug: "trip", summary: "S", description: "D", durationDays: 3, durationNights: 2, route: [{ destinationId: DEST, days: 3 }] };

  it("converts rupee amounts to paise and enforces package price coverage", () => {
    const ok = packageInput.parse({ ...pkg, pricingRules: [{ label: "Base", basis: "PER_PACKAGE", amount: "18,500", includedTravellers: "2", active: true }] });
    expect(ok.pricingRules[0]!.amount).toBe(18_500_00);
    expect(packageInput.safeParse({ ...pkg, pricingRules: [{ label: "Base", basis: "PER_PACKAGE", amount: "100", active: true }] }).success).toBe(false);
  });

  it("checks that the route matches the package duration", () => {
    expect(packageInput.safeParse({ ...pkg, route: [{ destinationId: DEST, days: 2 }] }).success).toBe(false);
    expect(packageInput.safeParse({ ...pkg, durationNights: 4 }).success).toBe(false);
  });

  it("validates seasons and forbids per-package rates on destinations", () => {
    const d = { name: "Gulmarg", slug: "gulmarg", summary: "S", description: "D" };
    expect(destinationInput.safeParse({ ...d, pricingRules: [{ label: "W", basis: "PER_PERSON_PER_DAY", amount: "10", seasonStart: "12-01", active: true }] }).success).toBe(false);
    expect(destinationInput.safeParse({ ...d, pricingRules: [{ label: "W", basis: "PER_PACKAGE", amount: "10", includedTravellers: 2, active: true }] }).success).toBe(false);
    expect(destinationInput.safeParse({ ...d, slug: "Bad Slug" }).success).toBe(false);
  });
});

describe("large but valid content", () => {
  it("accepts long descriptions up to the limit and rejects anything longer", () => {
    const base = { title: "T", slug: "t", summary: "S", durationDays: 1, durationNights: 0 };
    expect(packageInput.safeParse({ ...base, description: "x".repeat(8000) }).success).toBe(true);
    expect(packageInput.safeParse({ ...base, description: "x".repeat(8001) }).success).toBe(false);
    expect(contactSchema.safeParse({ name: "Asha", email: "a@example.com", message: "y".repeat(4000), consent: true }).success).toBe(true);
    expect(contactSchema.safeParse({ name: "Asha", email: "a@example.com", message: "y".repeat(4001), consent: true }).success).toBe(false);
  });
});
