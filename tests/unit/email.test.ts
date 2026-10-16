import { describe, expect, it } from "vitest";
import { assertSafeAddress, buildMimeMessage, encodeHeaderText, toBase64Url, UnsafeHeaderError } from "@/server/email/mime";
import { escapeHtml, renderCustomerAcknowledgement, renderInternalEnquiry, type EnquiryEmailData } from "@/server/email/templates";
import { backoffMs } from "@/server/email/outbox";
import { csvCell } from "@/server/enquiries/admin";

const data: EnquiryEmailData = {
  businessName: "Safar With Zakia",
  reference: "SWZ-2610-7K3QX",
  type: "CUSTOM_TRIP",
  submittedAt: new Date("2026-10-16T09:00:00Z"),
  customerName: "<script>alert(1)</script> Asha",
  email: "asha@example.com",
  phone: "+91 98765 43210",
  message: "Line 1\n<b>bold?</b> & more",
  packageTitle: null,
  destinations: [{ name: "Gulmarg", days: 2 }],
  travelDates: "10 November 2026",
  durationDays: 2,
  adults: 2,
  children: 1,
  accommodation: "Deluxe",
  transport: "Private SUV",
  interests: ["Snow"],
  addons: [],
  budget: "₹60,000",
  promoCode: null,
  estimate: { kind: "QUOTE_REQUIRED", currency: "INR", reasons: ["Child rates for Gulmarg have not been published."], promo: null },
  adminUrl: "https://example.com/admin/enquiries/1",
};

function decodeParts(raw: string): string[] {
  return [...raw.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+?)\r\n--/g)].map((m) => Buffer.from(m[1]!.replace(/\r\n/g, ""), "base64").toString("utf8"));
}

describe("MIME builder", () => {
  it("builds a multipart message with encoded UTF-8 subject and both bodies", () => {
    const raw = buildMimeMessage({ from: { address: "bookings@example.com", name: "Safar With Zakia" }, to: "inbox@example.com", replyTo: "asha@example.com", subject: "New enquiry — Gulmarg ₹", text: "Plain ✓", html: "<p>HTML ✓</p>", messageIdDomain: "example.com" });
    expect(raw).toContain('From: "Safar With Zakia" <bookings@example.com>');
    expect(raw).toContain("To: inbox@example.com");
    expect(raw).toContain("Reply-To: asha@example.com");
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(raw).toContain("multipart/alternative");
    expect(decodeParts(raw)).toEqual(["Plain ✓", "<p>HTML ✓</p>"]);
    expect(toBase64Url(raw)).not.toMatch(/[+/=]/);
  });

  it("refuses CR/LF and malformed addresses in headers", () => {
    const base = { from: { address: "a@example.com" }, to: "b@example.com", subject: "Hi", text: "t", html: "h", messageIdDomain: "example.com" };
    expect(() => buildMimeMessage({ ...base, to: "b@example.com\r\nBcc: c@example.com" })).toThrow(UnsafeHeaderError);
    expect(() => buildMimeMessage({ ...base, replyTo: "x@example.com, y@example.com" })).toThrow(UnsafeHeaderError);
    expect(() => buildMimeMessage({ ...base, subject: "Hi\r\nBcc: c@example.com" })).toThrow(UnsafeHeaderError);
    expect(() => assertSafeAddress("To", "Name <a@example.com>")).toThrow(UnsafeHeaderError);
    expect(() => assertSafeAddress("To", "asha.rao+trip@example.co.in")).not.toThrow();
  });

  it("leaves ASCII headers unencoded and splits long encoded words", () => {
    expect(encodeHeaderText("Plain subject")).toBe("Plain subject");
    const encoded = encodeHeaderText("ā".repeat(60));
    for (const word of encoded.split("\r\n ")) expect(word.length).toBeLessThanOrEqual(75);
  });
});

describe("email templates", () => {
  it("escapes customer-provided content in HTML", () => {
    expect(escapeHtml(`<a href="x">'&'</a>`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;&#39;&lt;/a&gt;");
    const { html, text, subject } = renderInternalEnquiry(data);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;b&gt;bold?&lt;/b&gt; &amp; more");
    expect(text).toContain("Reference: SWZ-2610-7K3QX");
    expect(text).toContain("Travellers: 2 adults, 1 child");
    expect(subject).toContain("SWZ-2610-7K3QX");
    expect(subject).not.toMatch(/[\r\n]/);
  });

  it("includes the reference, timezone and admin link for staff", () => {
    const { html, text } = renderInternalEnquiry(data);
    expect(text).toMatch(/Received: .*IST/);
    expect(html).toContain("https://example.com/admin/enquiries/1");
    expect(text).toContain("Quote required");
  });

  it("tells customers it is not a booking and omits admin links", () => {
    const { html, text } = renderCustomerAcknowledgement({ ...data, adminUrl: null, contactPhone: "+91 88992 77396", whatsappUrl: "https://wa.me/918899277396" });
    expect(text).toContain("It is not a booking");
    expect(html).not.toContain("/admin/");
    expect(text).toContain("SWZ-2610-7K3QX");
  });
});

describe("outbox backoff", () => {
  it("grows with each attempt and is bounded", () => {
    const noJitter = () => 0;
    expect(backoffMs(1, noJitter)).toBe(60_000);
    expect(backoffMs(2, noJitter)).toBe(300_000);
    expect(backoffMs(5, noJitter)).toBe(10_800_000);
    expect(backoffMs(50, noJitter)).toBe(10_800_000);
    expect(backoffMs(1, () => 1)).toBe(66_000);
  });
});

describe("CSV export", () => {
  it("quotes cells and neutralises spreadsheet formulas", () => {
    expect(csvCell('Say "hi"')).toBe('"Say ""hi"""');
    expect(csvCell("=HYPERLINK(\"http://evil\")")).toBe('"\'=HYPERLINK(""http://evil"")"');
    expect(csvCell("+91 98765")).toBe('"\'+91 98765"');
    expect(csvCell(null)).toBe('""');
  });
});
