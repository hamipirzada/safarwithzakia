import { devices, expect, test } from "@playwright/test";
import { adminSession, query } from "./helpers";

const ADMIN_NAV = [
  ["Dashboard", "/admin"],
  ["Enquiries", "/admin/enquiries"],
  ["Packages", "/admin/packages"],
  ["Destinations", "/admin/destinations"],
  ["Offers & promo codes", "/admin/offers"],
  ["Testimonials", "/admin/testimonials"],
  ["FAQs", "/admin/faqs"],
  ["Site content", "/admin/content"],
  ["Email delivery", "/admin/email-settings"],
  ["Business details", "/admin/settings"],
  ["Staff", "/admin/staff"],
  ["Audit log", "/admin/audit"],
] as const;

test.describe("admin sidebar", () => {
  test("every item has an icon and the right route; collapse persists across pages and reloads", async ({ browser }) => {
    const { context, page } = await adminSession(browser);
    await context.clearCookies({ name: "swz_admin_sidebar" });
    await page.goto("/admin");
    const sidebar = page.locator("aside[data-sidebar]");
    await expect(sidebar).toHaveAttribute("data-sidebar", "expanded");
    const nav = sidebar.getByRole("navigation", { name: "Admin" });
    for (const [label, href] of ADMIN_NAV) {
      const link = nav.getByRole("link", { name: new RegExp(`^${label.replace(/[&]/g, "\\$&")}`) });
      await expect(link).toHaveAttribute("href", href);
      await expect(link.locator("svg")).toHaveCount(1);
    }
    await expect(nav.getByRole("link", { name: /^Dashboard/ })).toHaveAttribute("aria-current", "page");

    const mainWidth = async () => (await page.locator("main").boundingBox())!.width;
    const expandedWidth = await mainWidth();
    await page.getByRole("button", { name: "Collapse sidebar" }).click();
    await expect(sidebar).toHaveAttribute("data-sidebar", "collapsed");
    await expect.poll(mainWidth).toBeGreaterThan(expandedWidth + 100); // content reflows once the 200ms width transition ends

    // Collapsed: accessible names stay, tooltips on hover and on keyboard focus
    const packages = nav.getByRole("link", { name: "Packages" });
    await expect(packages).toBeVisible();
    await packages.hover();
    await expect(page.locator('[data-rail-tooltip="Packages"]')).toBeVisible();
    await nav.getByRole("link", { name: "Destinations" }).focus();
    await expect(page.locator('[data-rail-tooltip="Destinations"]')).toBeVisible();

    // Navigate while collapsed, then reload: preference kept, active route marked
    await packages.click();
    await expect(page).toHaveURL(/\/admin\/packages$/);
    await expect(sidebar).toHaveAttribute("data-sidebar", "collapsed");
    await expect(packages).toHaveAttribute("aria-current", "page");
    await page.reload();
    await expect(page.locator("aside[data-sidebar]")).toHaveAttribute("data-sidebar", "collapsed");
    await page.getByRole("button", { name: "Expand sidebar" }).click();
    await expect(page.locator("aside[data-sidebar]")).toHaveAttribute("data-sidebar", "expanded");
    await page.reload();
    await expect(page.locator("aside[data-sidebar]")).toHaveAttribute("data-sidebar", "expanded");
  });

  test("staff see every page they may use, and nothing else; the server still blocks the rest", async ({ browser }) => {
    const { page } = await adminSession(browser, "staff@e2e.test", "e2e-staff-password-1", { fresh: true });
    const nav = page.locator("aside[data-sidebar]").getByRole("navigation", { name: "Admin" });
    const labels = await nav.getByRole("link").evaluateAll((links) => links.map((l) => l.textContent?.replace(/\d+$/, "").trim()));
    expect(labels).toEqual(ADMIN_NAV.slice(0, 8).map(([label]) => label));
    await page.goto("/admin/staff");
    await expect(page).toHaveURL(/denied=1/);
  });

  test("mobile drawer: opens, traps focus, closes with Escape or backdrop, returns focus", async ({ browser }) => {
    const { context: desktop } = await adminSession(browser);
    const context = await browser.newContext({ ...devices["Pixel 7"], storageState: await desktop.storageState() });
    const page = await context.newPage();
    await page.goto("/admin");
    const menu = page.getByRole("button", { name: "Open navigation" });
    await menu.click();
    const drawer = page.getByRole("dialog", { name: "Admin navigation" });
    await expect(drawer).toBeVisible();
    await expect(menu).toHaveAttribute("aria-expanded", "true");
    await expect(drawer.getByRole("button", { name: "Close navigation" })).toBeFocused();
    // Focus wraps from the last control back to the first
    await drawer.getByRole("button", { name: "Sign out" }).focus();
    await page.keyboard.press("Tab");
    await expect(drawer.getByRole("button", { name: "Close navigation" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
    await expect(menu).toBeFocused();
    // Backdrop closes; a link navigates and closes
    await menu.click();
    await page.getByTestId("drawer-backdrop").click({ position: { x: 380, y: 400 } });
    await expect(drawer).toBeHidden();
    await menu.click();
    await drawer.getByRole("link", { name: "FAQs" }).click();
    await expect(page).toHaveURL(/\/admin\/faqs$/);
    await expect(drawer).toBeHidden();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe("admin dashboard figures", () => {
  test("KPIs, trend and status bars match the database for the selected period", async ({ browser }) => {
    const { page } = await adminSession(browser);
    // Deterministic fixtures for today (plus whatever other tests created); one is spam.
    const tag = Date.now().toString(36).toUpperCase();
    for (const [i, status] of (["NEW", "CONTACTED", "SPAM"] as const).entries()) {
      await query(
        `INSERT INTO enquiry (id, reference, type, status, "customerName", email, snapshot, "consentAt", "updatedAt") VALUES (gen_random_uuid(), $1, 'CONTACT', $2, 'Dashboard Fixture', 'dash@example.test', '{}', now(), now())`,
        [`SWZ-DASH-${tag}${i}`, status],
      );
    }
    // Same definitions as the dashboard: India-time days, spam excluded from volume.
    const [{ received }] = (await query<{ received: number }>(
      `SELECT count(*)::int AS received FROM enquiry
       WHERE status <> 'SPAM' AND (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '6 days'`,
    )) as [{ received: number }];
    const statusRows = await query<{ status: string; n: number }>(
      `SELECT status, count(*)::int AS n FROM enquiry
       WHERE (("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata') >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') - interval '6 days' GROUP BY status`,
    );
    const [{ open }] = (await query<{ open: number }>(`SELECT count(*)::int AS open FROM enquiry WHERE "archivedAt" IS NULL AND status IN ('NEW','CONTACTED','QUOTE_PREPARATION','QUOTE_SENT')`)) as [{ open: number }];
    const [{ pkgs }] = (await query<{ pkgs: number }>(`SELECT count(*)::int AS pkgs FROM package WHERE status = 'PUBLISHED'`)) as [{ pkgs: number }];

    await page.goto("/admin?range=7d");
    await expect(page.getByRole("link", { name: "Last 7 days", exact: true })).toHaveAttribute("aria-current", "page");
    await expect(page.getByTestId("kpi-received")).toHaveText(String(received));
    await expect(page.getByTestId("kpi-open")).toHaveText(String(open));
    await expect(page.getByTestId("kpi-packages")).toHaveText(String(pkgs));

    // Trend: the table view is the chart's text equivalent and sums to the KPI
    const trendCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Enquiries received", exact: true }) });
    await trendCard.getByRole("button", { name: "Show table" }).click();
    const rows = trendCard.locator("tbody tr");
    await expect(rows).toHaveCount(7);
    const sum = (await rows.locator("td:nth-child(2)").allTextContents()).reduce((s, v) => s + Number(v), 0);
    expect(sum).toBe(received);

    // Status bars carry their values (and accessible labels)
    const statusCard = page.locator("section").filter({ has: page.getByRole("heading", { name: "Status of enquiries" }) });
    const labels: Record<string, string> = { NEW: "New", CONTACTED: "Contacted", QUOTE_PREPARATION: "Quote preparation", QUOTE_SENT: "Quote sent", CONFIRMED: "Confirmed", CLOSED: "Closed", SPAM: "Spam" };
    for (const row of statusRows) {
      await expect(statusCard.locator(`li[aria-label^="${labels[row.status]}:"]`)).toHaveAttribute("data-value", String(row.n));
    }

    // The trend chart is keyboard-readable
    await trendCard.getByRole("button", { name: "Show chart" }).click();
    const chart = trendCard.locator("svg[data-chart=trend]");
    await chart.focus();
    await page.keyboard.press("End");
    await expect(trendCard.locator("[aria-live=polite]")).toHaveText(/enquir/);

    // Period selector changes the granularity
    await page.getByRole("link", { name: "Last 12 months", exact: true }).click();
    await expect(page).toHaveURL(/range=12m/);
    await trendCard.getByRole("button", { name: "Show table" }).click();
    await expect(trendCard.locator("tbody tr")).toHaveCount(12);
  });
});
