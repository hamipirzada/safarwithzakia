import { expect, test, type Browser, type Locator, type Page } from "@playwright/test";
import { adminSession, query } from "./helpers";

/**
 * Every dashboard chart, exercised in a real browser and reconciled with independent SQL over the
 * same definitions (India-time days, spam excluded from volume, archived included).
 */

const IST_DAY = `(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata')::date`;
const TODAY = `(now() AT TIME ZONE 'Asia/Kolkata')::date`;
const TAG = `CHART${Date.now().toString(36).toUpperCase()}`;
const KINDS = ["CONTACT", "PACKAGE", "CUSTOM_TRIP"] as const;
const LABELS = { CONTACT: "Contact", PACKAGE: "Package", CUSTOM_TRIP: "Custom trip" } as const;
let seq = 0;

/** An enquiry received `daysAgo` India-time days ago, at 00:20 IST. */
async function fixture(daysAgo: number, type: (typeof KINDS)[number] = "CONTACT", status = "NEW") {
  seq++;
  await query(
    `INSERT INTO enquiry (id, reference, type, status, "customerName", email, snapshot, "consentAt", "createdAt", "updatedAt")
     VALUES (gen_random_uuid(), $1, $2, $3, 'Chart Fixture', 'chart@example.test', '{}', now(),
             ((${TODAY} - $4::int) + time '00:20') AT TIME ZONE 'Asia/Kolkata' AT TIME ZONE 'UTC', now())`,
    [`SWZ-${TAG}-${seq}`, type, status, daysAgo],
  );
}

const one = async (sql: string, params: unknown[] = []) => Number(Object.values((await query(sql, params))[0] ?? { n: 0 })[0] ?? 0);
const dayCount = (daysAgo: number, type?: string) =>
  one(`SELECT count(*)::int FROM enquiry WHERE status <> 'SPAM' AND ${IST_DAY} = ${TODAY} - $1::int ${type ? "AND type = $2" : ""}`, type ? [daysAgo, type] : [daysAgo]);
const rangeCount = (fromDaysAgo: number, toDaysAgo: number, type?: string) =>
  one(`SELECT count(*)::int FROM enquiry WHERE status <> 'SPAM' AND ${IST_DAY} BETWEEN ${TODAY} - $1::int AND ${TODAY} - $2::int ${type ? "AND type = $3" : ""}`, type ? [fromDaysAgo, toDaysAgo, type] : [fromDaysAgo, toDaysAgo]);

const trendCard = (page: Page) => page.locator("section").filter({ has: page.getByRole("heading", { name: "Enquiries received", exact: true }) });
const card = (page: Page, heading: string) => page.locator("section").filter({ has: page.getByRole("heading", { name: heading, exact: true }) });

/** Moves the pointer onto the trend point at `index` (same geometry as the chart: 34px left, 40px right padding). */
async function hoverPoint(page: Page, svg: Locator, index: number, count: number) {
  const box = (await svg.boundingBox())!;
  const x = box.x + 34 + (index / (count - 1)) * (box.width - 74);
  await page.mouse.move(x, box.y + box.height / 2);
  return { x, y: box.y + box.height / 2 };
}

async function istDate(daysAgo: number) {
  const rows = await query<{ d: string }>(`SELECT to_char(${TODAY} - $1::int, 'YYYY-MM-DD') AS d`, [daysAgo]);
  return rows[0]!.d;
}

async function signedInContext(browser: Browser, options: Parameters<Browser["newContext"]>[0]) {
  const { context } = await adminSession(browser);
  const storageState = await context.storageState();
  await context.close();
  const ctx = await browser.newContext({ ...options, storageState });
  return { context: ctx, page: await ctx.newPage() };
}

test.describe("dashboard charts", () => {
  test.beforeAll(async () => {
    await fixture(0, "CONTACT");
    await fixture(0, "CONTACT");
    await fixture(0, "PACKAGE");
    await fixture(0, "CONTACT", "SPAM"); // never counted as demand
    await fixture(2, "CUSTOM_TRIP");
    await fixture(3, "PACKAGE");
    await fixture(33, "CONTACT"); // previous period, aligned with 3 days ago
    await fixture(33, "CONTACT");
  });
  test.afterAll(async () => {
    await query(`DELETE FROM enquiry WHERE reference LIKE $1`, [`SWZ-${TAG}-%`]);
  });

  test("trend: summary, tooltips (pointer and keyboard) match the database", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin");
    const trend = trendCard(page);
    const svg = trend.locator("svg[data-chart=trend]");
    const total = await rangeCount(29, 0);
    await expect(trend.getByTestId("trend-total")).toHaveText(String(total));
    await expect(trend.getByTestId("trend-average")).toHaveText((total / 30).toFixed(1));
    await expect(page.getByTestId("kpi-received")).toHaveText(String(total));
    await expect(svg.locator("[data-series=total]")).toHaveCount(1);

    // Keyboard: End = today, then two days back
    await svg.focus();
    await page.keyboard.press("End");
    const tip = trend.getByTestId("trend-tooltip");
    await expect(tip).toBeVisible();
    await expect(tip.getByTestId("tooltip-total")).toContainText(String(await dayCount(0)));
    for (const k of KINDS) await expect(tip.locator(`[data-kind=${k}]`)).toContainText(String(await dayCount(0, k)));
    await expect(trend.locator("[aria-live=polite]")).toContainText(`${await dayCount(0)} enquir`);
    await page.keyboard.press("ArrowLeft");
    await page.keyboard.press("ArrowLeft");
    await expect(tip.getByTestId("tooltip-total")).toContainText(String(await dayCount(2)));
    await expect(tip.locator("[data-kind=CUSTOM_TRIP]")).toContainText(String(await dayCount(2, "CUSTOM_TRIP")));
    await page.keyboard.press("Home");
    await expect(trend.locator("[aria-live=polite]")).toContainText(String(await dayCount(29)));

    // Pointer: hovering a point shows the same figures; leaving hides the tooltip
    await hoverPoint(page, svg, 26, 30); // 3 days ago
    await expect(tip.getByTestId("tooltip-total")).toContainText(String(await dayCount(3)));
    await expect(tip.locator("[data-kind=PACKAGE]")).toContainText(String(await dayCount(3, "PACKAGE")));
    await page.mouse.move(0, 0);
    await expect(tip).toBeHidden();
  });

  test("trend: previous-period comparison and the by-type view with legend toggles", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin");
    const trend = trendCard(page);
    const svg = trend.locator("svg[data-chart=trend]");
    const current = await rangeCount(29, 0);
    const previous = await rangeCount(59, 30);

    // The KPI and chart state the change honestly (no percentage when the previous period had none)
    const expectedChange = previous === 0 ? "" : String(Math.round(((current - previous) / previous) * 100));
    await expect(page.getByTestId("change-note").first()).toHaveAttribute("data-change", expectedChange);

    await trend.getByRole("button", { name: /Compare with previous 30 days/ }).click();
    await expect(trend.getByRole("button", { name: /Compare with previous 30 days/ })).toHaveAttribute("aria-pressed", "true");
    await expect(svg).toHaveAttribute("data-compare", "on");
    await expect(svg.locator("[data-series=previous]")).toHaveCount(1);
    await expect(trend.getByTestId("trend-legend")).toContainText(`Previous 30 days ${previous}`);
    await svg.focus();
    await page.keyboard.press("End");
    for (let i = 0; i < 3; i++) await page.keyboard.press("ArrowLeft"); // 3 days ago ↔ 33 days ago
    await expect(trend.getByTestId("tooltip-previous")).toContainText(String(await dayCount(33)));
    await expect(trend.getByTestId("tooltip-previous")).toContainText(String(await istDate(33)).slice(8).replace(/^0/, ""));

    // By type: three stacked layers in fixed order, legend totals from the database
    await trend.getByRole("button", { name: "By type", exact: true }).click();
    await expect(svg).toHaveAttribute("data-mode", "type");
    await expect(svg.locator("g[data-series]")).toHaveCount(3);
    expect(await svg.locator("g[data-series]").evaluateAll((els) => els.map((e) => e.getAttribute("data-series")))).toEqual([...KINDS]);
    const legend = trend.getByTestId("trend-legend");
    for (const k of KINDS) await expect(legend.getByRole("button", { name: new RegExp(`^${LABELS[k]}`) })).toContainText(String(await rangeCount(29, 0, k)));

    // Toggling a legend entry hides that layer; the last visible one cannot be hidden
    await legend.getByRole("button", { name: /^Contact/ }).click();
    await expect(legend.getByRole("button", { name: /^Contact/ })).toHaveAttribute("aria-pressed", "false");
    await expect(svg.locator("g[data-series=CONTACT]")).toHaveCount(0);
    await legend.getByRole("button", { name: /^Package/ }).click();
    await expect(svg.locator("g[data-series]")).toHaveCount(1);
    await expect(legend.getByRole("button", { name: /^Custom trip/ })).toBeDisabled();
    await legend.getByRole("button", { name: /^Contact/ }).click();
    await expect(svg.locator("g[data-series=CONTACT]")).toHaveCount(1);
    // Colour follows the type: re-shown Contact keeps slot 1 and stays first
    expect(await svg.locator("g[data-series]").evaluateAll((els) => els.map((e) => e.getAttribute("data-series")))).toEqual(["CONTACT", "CUSTOM_TRIP"]);
    await expect(svg.locator("g[data-series=CONTACT] path").first()).toHaveAttribute("fill", "#2a78d6");
  });

  test("trend: clicking a day (or pressing Enter) opens exactly that day's enquiries", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin");
    const svg = trendCard(page).locator("svg[data-chart=trend]");
    const today = await istDate(0);

    await svg.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(new RegExp(`/admin/enquiries\\?from=${today}&to=${today}$`));
    await expect(page.getByTestId("received-filter")).toContainText("Received on");
    const activeToday = await one(`SELECT count(*)::int FROM enquiry WHERE status <> 'SPAM' AND "archivedAt" IS NULL AND ${IST_DAY} = ${TODAY}`);
    await expect(page.getByText(new RegExp(`^${activeToday} enquir(y|ies)$`))).toBeVisible();
    await expect(page.getByText("Chart Fixture").first()).toBeVisible();
    // Other filters keep the date; removing it returns to the full list
    await page.getByLabel("Type").selectOption("PACKAGE");
    await page.getByRole("button", { name: "Filter" }).click();
    await expect(page).toHaveURL(new RegExp(`from=${today}.*to=${today}|to=${today}.*from=${today}`));
    await expect(page.getByText(new RegExp(`^${await dayCount(0, "PACKAGE")} enquir`))).toBeVisible();
    await page.getByRole("link", { name: "Remove date filter" }).click();
    await expect(page).not.toHaveURL(/from=/);
    await expect(page.getByTestId("received-filter")).toHaveCount(0);

    // Pointer click on two days ago
    await page.goto("/admin");
    const svg2 = trendCard(page).locator("svg[data-chart=trend]");
    const { x, y } = await hoverPoint(page, svg2, 27, 30);
    await page.mouse.click(x, y);
    const twoAgo = await istDate(2);
    await expect(page).toHaveURL(new RegExp(`from=${twoAgo}&to=${twoAgo}`));
    await expect(page.getByText(new RegExp(`^${await dayCount(2)} enquir`))).toBeVisible();
  });

  test("12-month view: monthly points link to the whole month", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin?range=12m");
    const trend = trendCard(page);
    await expect(trend.getByText("Average per month")).toBeVisible();
    await expect(trend.getByTestId("trend-total")).toHaveText(String(await one(
      `SELECT count(*)::int FROM enquiry WHERE status <> 'SPAM' AND ${IST_DAY} >= date_trunc('month', ${TODAY}) - interval '11 months'`,
    )));
    const svg = trend.locator("svg[data-chart=trend]");
    await svg.focus();
    await page.keyboard.press("End");
    await page.keyboard.press("Enter");
    const month = (await istDate(0)).slice(0, 7);
    const [y, m] = month.split("-").map(Number) as [number, number];
    const lastDay = String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0");
    await expect(page).toHaveURL(new RegExp(`from=${month}-01&to=${month}-${lastDay}`));
  });

  test("weekday columns and bar lists: values, shares, hover/focus details and links", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin");

    // Weekday columns equal SQL per ISO weekday (India time)
    const weekRows = await query<{ dow: number; n: number }>(
      `SELECT extract(isodow FROM ${IST_DAY})::int AS dow, count(*)::int AS n FROM enquiry WHERE status <> 'SPAM' AND ${IST_DAY} >= ${TODAY} - 29 GROUP BY 1`,
    );
    const week = card(page, "Busiest days of the week");
    const cols = week.locator("[data-chart=columns] > li");
    await expect(cols).toHaveCount(7);
    for (let d = 1; d <= 7; d++) await expect(cols.nth(d - 1)).toHaveAttribute("data-value", String(weekRows.find((r) => r.dow === d)?.n ?? 0));
    const busiest = Math.max(...weekRows.map((r) => r.n));
    await expect(week.getByTestId("columns-summary")).toContainText(String(busiest));
    const todayCol = cols.nth(((await one(`SELECT extract(isodow FROM ${TODAY})::int`)) as number) - 1);
    await todayCol.hover();
    await expect(todayCol.locator("[data-column-tip]")).toBeVisible();
    await page.mouse.move(0, 0);
    await expect(todayCol.locator("[data-column-tip]")).toBeHidden();
    await todayCol.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab"); // keyboard focus (focus-visible)
    await expect(todayCol.locator("[data-column-tip]")).toBeVisible();

    // Status bars: widths proportional to the largest, shares of the period total
    const status = card(page, "Status of enquiries");
    const rows = status.locator("[data-chart=bars] > li");
    const values = (await rows.evaluateAll((els) => els.map((e) => Number(e.getAttribute("data-value")))));
    const max = Math.max(...values);
    const periodTotal = await one(`SELECT count(*)::int FROM enquiry WHERE ${IST_DAY} >= ${TODAY} - 29`); // spam included here
    expect(values.reduce((s, v) => s + v, 0)).toBe(periodTotal);
    for (const [i, v] of values.entries()) {
      await expect(rows.nth(i).locator("[data-bar-width]")).toHaveAttribute("data-bar-width", ((v / max) * 100).toFixed(1));
      const pct = (v / periodTotal) * 100;
      await expect(rows.nth(i).locator("[data-share]")).toHaveText(pct < 1 ? "<1%" : `${Math.round(pct)}%`);
    }
    // Hovering a row recedes the others
    await rows.first().hover();
    if (values.length > 1) await expect.poll(() => rows.nth(1).evaluate((e) => Number(getComputedStyle(e).opacity))).toBeLessThan(0.75);
    await expect.poll(() => rows.first().evaluate((e) => Number(getComputedStyle(e).opacity))).toBe(1);
    // Bars link to the filtered list
    await status.getByRole("link", { name: /^New/ }).click();
    await expect(page).toHaveURL(/\/admin\/enquiries\?status=NEW/);
    await expect(page.getByLabel("Status")).toHaveValue("NEW");
  });

  test("every chart has a working table view", async ({ browser }) => {
    const { page } = await adminSession(browser);
    await page.goto("/admin");
    const trend = trendCard(page);
    await trend.getByRole("button", { name: "Show table" }).click();
    await expect(trend.locator("tbody tr")).toHaveCount(30);
    const prevSum = (await trend.locator("tbody tr td:last-child").allTextContents()).reduce((s, v) => s + Number(v), 0);
    expect(prevSum).toBe(await rangeCount(59, 30));
    const contactSum = (await trend.locator("tbody tr td:nth-child(3)").allTextContents()).reduce((s, v) => s + Number(v), 0);
    expect(contactSum).toBe(await rangeCount(29, 0, "CONTACT"));
    await trend.getByRole("button", { name: "Show chart" }).click();
    await expect(trend.locator("svg[data-chart=trend]")).toBeVisible();

    for (const heading of ["Busiest days of the week", "Status of enquiries", "Most requested packages", "Most requested destinations"]) {
      const c = card(page, heading);
      const toggle = c.locator("button[aria-controls]"); // "Show table" ⇄ "Show chart"
      if ((await toggle.count()) === 0) {
        await expect(c.locator("[data-chart=empty]"), `${heading} shows its empty state`).toBeVisible();
        continue;
      }
      const chartValues = await c.locator("[data-value]").evaluateAll((els) => els.map((e) => e.getAttribute("data-value")));
      await expect(toggle).toHaveText("Show table");
      await toggle.click();
      await expect(toggle).toHaveAttribute("aria-expanded", "true");
      await expect(toggle).toHaveText("Show chart");
      const tableValues = await c.locator("tbody tr td:nth-child(2)").allTextContents();
      expect(tableValues, heading).toEqual(chartValues);
      await toggle.click();
      await expect(c.locator("[data-chart]")).toBeVisible();
    }
  });

  test("phone width: charts fit, respond to touch, and the page never scrolls sideways", async ({ browser }) => {
    const { context, page } = await signedInContext(browser, { viewport: { width: 390, height: 844 }, hasTouch: true, isMobile: true });
    await page.goto("/admin");
    const trend = trendCard(page);
    const svg = trend.locator("svg[data-chart=trend]");
    await svg.scrollIntoViewIfNeeded();
    const [svgBox, cardBox] = [await svg.boundingBox(), await trend.boundingBox()];
    expect(svgBox!.width).toBeLessThanOrEqual(cardBox!.width);
    // First tap reads the point (and must not navigate away)
    await svg.tap({ position: { x: svgBox!.width - 40, y: 120 } }); // today's point (40px right padding)
    await expect(trend.getByTestId("trend-tooltip")).toBeVisible();
    await expect(trend.getByTestId("trend-tooltip")).toContainText("Tap again to open");
    await expect(page).toHaveURL(/\/admin$/);
    const tipBox = await trend.getByTestId("trend-tooltip").boundingBox();
    expect(tipBox!.x).toBeGreaterThanOrEqual(cardBox!.x);
    expect(tipBox!.x + tipBox!.width).toBeLessThanOrEqual(cardBox!.x + cardBox!.width + 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    // A second tap on the same point opens that day's enquiries
    await svg.tap({ position: { x: svgBox!.width - 40, y: 120 } }); // today's point (40px right padding)
    await expect(page).toHaveURL(/\/admin\/enquiries\?from=/);
    await context.close();
  });

  test("entry animations run, and are switched off for reduced motion", async ({ browser }) => {
    const { context, page } = await adminSession(browser);
    await page.goto("/admin");
    const line = trendCard(page).locator("path.chart-draw");
    expect(await line.evaluate((e) => getComputedStyle(e).animationName)).toBe("chart-draw");
    expect(await line.evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))).toBeGreaterThan(0.5);
    expect(await page.locator(".bar-grow").first().evaluate((e) => getComputedStyle(e).animationName)).toBe("bar-grow");
    await context.close();

    const reduced = await signedInContext(browser, { reducedMotion: "reduce" });
    await reduced.page.goto("/admin");
    const still = trendCard(reduced.page).locator("path.chart-draw");
    expect(await still.evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))).toBeLessThan(0.001);
    expect(await reduced.page.locator(".bar-grow").first().evaluate((e) => parseFloat(getComputedStyle(e).animationDuration))).toBeLessThan(0.001);
    await reduced.context.close();
  });
});
