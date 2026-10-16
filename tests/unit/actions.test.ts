import { describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Simulate the database being unreachable while the session is checked / an enquiry is saved.
vi.mock("@/server/authz", async () => {
  class AuthorizationError extends Error {
    constructor(readonly reason: string) {
      super(reason);
    }
  }
  return { AuthorizationError, requireStaff: vi.fn(async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5432"); }) };
});
vi.mock("@/server/enquiries/submit", () => ({
  submitContact: vi.fn(async () => { throw new Error("connect ECONNREFUSED 127.0.0.1:5432"); }),
  submitCustomTrip: vi.fn(),
  submitPackageEnquiry: vi.fn(),
  previewTripEstimate: vi.fn(),
}));
vi.mock("@/server/request-context", () => ({ clientIp: async () => null, hashIp: () => null }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const after = vi.fn();
vi.mock("next/server", () => ({ after: (fn: unknown) => after(fn) }));

const { adminAction, formCheckbox } = await import("@/server/admin/action");
const { submitContactAction } = await import("@/app/(site)/actions");

describe("failure handling", () => {
  it("admin actions fail closed with a clear message when the session cannot be verified", async () => {
    const handler = vi.fn();
    const action = adminAction("STAFF", z.object({}), handler);
    const result = await action({ status: "idle" }, new FormData());
    expect(result).toEqual({ status: "error", message: expect.stringContaining("Nothing was saved") });
    expect(handler).not.toHaveBeenCalled();
  });

  it("public submissions never report success when the enquiry could not be saved", async () => {
    const result = await submitContactAction({ name: "A" });
    expect(result).toMatchObject({ ok: false, error: "UNAVAILABLE" });
    expect(after).not.toHaveBeenCalled();
  });

  it("parses HTML checkboxes, including the missing value of an unchecked box", () => {
    const schema = z.object({ flag: formCheckbox });
    expect(schema.parse({}).flag).toBe(false);
    expect(schema.parse({ flag: "on" }).flag).toBe(true);
    expect(schema.parse({ flag: "" }).flag).toBe(false);
  });
});
