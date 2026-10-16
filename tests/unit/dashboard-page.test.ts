import { describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("@/server/authz", () => ({
  requireStaffPage: async () => ({ id: "u1", name: "Test Admin", email: "a@example.test", role: "ADMIN" }),
  hasRole: () => true,
}));
vi.mock("@/server/email/config", () => ({ resolveGmailTransport: async () => ({ ok: false, state: "UNCONFIGURED", message: "Not configured." }) }));
vi.mock("@/server/dashboard", async (original) => ({
  ...(await original<typeof import("@/server/dashboard")>()),
  getDashboardData: vi.fn(async () => {
    throw new Error("connect ECONNREFUSED 127.0.0.1:5432");
  }),
}));

const { default: DashboardPage } = await import("@/app/admin/(panel)/page");

describe("dashboard when the database fails", () => {
  it("shows an explicit unavailable state instead of zero values", async () => {
    const element = await DashboardPage({ searchParams: Promise.resolve({}), params: Promise.resolve({}) } as never);
    const html = renderToStaticMarkup(element);
    expect(html).toContain("Dashboard figures are unavailable right now");
    expect(html).toContain('role="alert"');
    expect(html).not.toContain('data-testid="kpi-received"');
    expect(html).not.toContain("Enquiries received");
  });
});
