import { expect, test } from "@playwright/test";

test.describe("public website", () => {
  test("homepage shows the hero, primary actions and real destinations", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1, name: "Experience Kashmir, your way" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Plan your trip" }).first()).toBeVisible();
    await expect(page.getByRole("group", { name: "Destinations in Kashmir" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Gulmarg" }).first()).toBeVisible();
    // Unverified testimonials from the old site are seeded as drafts and must not appear.
    await expect(page.getByText("Vikram Singh")).toHaveCount(0);
  });

  test("the 3D ring can be driven with the keyboard", async ({ page }) => {
    await page.goto("/");
    const ring = page.getByRole("group", { name: "Destinations in Kashmir" });
    const caption = page.locator("[aria-live=polite]").first();
    const before = await caption.textContent();
    await ring.focus();
    await page.keyboard.press("ArrowRight");
    await expect(caption).not.toHaveText(before ?? "");
  });

  test("a visitor opens a destination", async ({ page }) => {
    await page.goto("/destinations");
    await page.getByRole("link", { name: "Gulmarg" }).first().click();
    await expect(page).toHaveURL(/\/destinations\/gulmarg$/);
    await expect(page.getByRole("heading", { level: 1, name: "Gulmarg" })).toBeVisible();
    await expect(page.getByText("Gondola ride", { exact: true })).toBeVisible();
    await expect(page.getByText("per person, per day").first()).toBeVisible();
  });

  test("a visitor views a package and its published price", async ({ page }) => {
    await page.goto("/packages");
    await page.getByRole("link", { name: "Kashmir Honeymoon Delight" }).click();
    await expect(page.getByRole("heading", { level: 1, name: "Kashmir Honeymoon Delight" })).toBeVisible();
    await expect(page.getByText("₹18,500 for 2 travellers").first()).toBeVisible();
    await expect(page.getByRole("heading", { name: "Enquire about this package" })).toBeVisible();
  });

  test("unknown pages return a helpful 404 and old PHP links redirect", async ({ page }) => {
    const response = await page.goto("/no-such-page");
    expect(response?.status()).toBe(404);
    await expect(page.getByRole("heading", { name: /doesn’t lead anywhere/ })).toBeVisible();
    await page.goto("/trip-builder.php?location=2");
    await expect(page).toHaveURL(/\/trip-builder\?.*destination=gulmarg/);
  });

  test("SEO files are served", async ({ request }) => {
    expect((await request.get("/robots.txt")).status()).toBe(200);
    const sitemap = await (await request.get("/sitemap.xml")).text();
    expect(sitemap).toContain("/destinations/gulmarg");
    expect(sitemap).not.toContain("/admin");
  });
});

test.describe("quality", () => {
  test("public pages load without console errors or failed requests", async ({ page }) => {
    const problems: string[] = [];
    page.on("console", (m) => m.type() === "error" && problems.push(`console: ${m.text()}`));
    page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
    page.on("response", (r) => r.status() >= 400 && !r.url().includes("/no-such") && problems.push(`${r.status()} ${r.url()}`));
    for (const path of ["/", "/destinations", "/destinations/srinagar-dal-lake", "/packages", "/packages/kashmir-honeymoon-delight", "/trip-builder", "/about", "/contact", "/track", "/privacy", "/credits"]) {
      await page.goto(path, { waitUntil: "networkidle" });
    }
    expect(problems).toEqual([]);
  });

  test("the 3D ring stays still for visitors who prefer reduced motion", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    const ring = page.getByRole("group", { name: "Destinations in Kashmir" }).locator("> div").first();
    const before = await ring.evaluate((el) => (el as HTMLElement).style.transform);
    await page.waitForTimeout(1500);
    expect(await ring.evaluate((el) => (el as HTMLElement).style.transform)).toBe(before);
    await context.close();
  });
});
