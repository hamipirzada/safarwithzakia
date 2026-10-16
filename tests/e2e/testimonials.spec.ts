import { expect, test, type Page } from "@playwright/test";
import { query } from "./helpers";

const PREFIX = "Layout Guest";
const VIEWPORTS = [
  { name: "desktop", width: 1280, height: 900, columnsFor: (n: number) => (n === 2 ? 2 : 3) },
  { name: "tablet", width: 834, height: 1112, columnsFor: () => 2 },
  { name: "phone", width: 390, height: 844, columnsFor: () => 1 }, // the next card peeks in
];

async function setFixtures(count: number) {
  await query(`DELETE FROM testimonial WHERE "authorName" LIKE $1`, [`${PREFIX}%`]);
  // Other published testimonials (from other tests) are hidden for the duration of this check.
  await query(`UPDATE testimonial SET status = 'DRAFT' WHERE status = 'PUBLISHED'`);
  for (let i = 1; i <= count; i++) {
    const quote = i % 2 ? `Short and sweet stay number ${i}.` : `A longer story number ${i}: the houseboat, the meadows of Gulmarg and the drive to Sonmarg were all arranged with care and patience by the team.`;
    await query(`INSERT INTO testimonial (id, "authorName", quote, rating, "consentConfirmed", status, "sortOrder", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 5, true, 'PUBLISHED', $3, now())`, [`${PREFIX} ${i}`, quote, i]);
  }
  // Must never appear
  await query(`INSERT INTO testimonial (id, "authorName", quote, "consentConfirmed", status, "updatedAt") VALUES (gen_random_uuid(), $1, 'Draft review', false, 'DRAFT', now())`, [`${PREFIX} draft`]);
  await query(`INSERT INTO testimonial (id, "authorName", quote, "consentConfirmed", status, "updatedAt") VALUES (gen_random_uuid(), $1, 'Archived review', true, 'ARCHIVED', now())`, [`${PREFIX} archived`]);
}

/** Cards fully inside the carousel's visible area = cards per view. */
async function columns(page: Page) {
  return page.locator("[data-testimonial-track]").evaluate((track) => {
    const box = track.getBoundingClientRect();
    return Array.from(track.querySelectorAll("[data-testimonial-id]")).filter((c) => {
      const r = c.getBoundingClientRect();
      return r.left >= box.left - 2 && r.right <= box.right + 2;
    }).length;
  });
}

const firstInView = (page: Page) =>
  page.locator("[data-testimonial-track]").evaluate((track) => {
    const left = track.getBoundingClientRect().left;
    const cards = Array.from(track.querySelectorAll<HTMLElement>("[data-testimonial-id]"));
    const i = cards.findIndex((c) => Math.abs(c.getBoundingClientRect().left - left) < 4);
    return i;
  });

test.describe("testimonial layout", () => {
  test.afterAll(async () => {
    await query(`DELETE FROM testimonial WHERE "authorName" LIKE $1`, [`${PREFIX}%`]);
  });

  for (const count of [1, 2, 3, 4, 5, 6]) {
    test(`${count} published testimonial${count === 1 ? "" : "s"} render once each, in the intended columns`, async ({ browser }) => {
      await setFixtures(count);
      for (const vp of VIEWPORTS) {
        const context = await browser.newContext({ viewport: { width: vp.width, height: vp.height } });
        const page = await context.newPage();
        await page.goto("/");
        const section = page.locator("section[aria-labelledby=reviews-title]");
        await expect(section).toHaveAttribute("data-testimonial-count", String(count));
        const ids = await section.locator("[data-testimonial-id]").evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.testimonialId));
        expect(ids, vp.name).toHaveLength(count);
        expect(new Set(ids).size, `${vp.name}: no duplicates`).toBe(count);
        await expect(section.getByText("Draft review")).toHaveCount(0);
        await expect(section.getByText("Archived review")).toHaveCount(0);
        if (count === 1) {
          await expect(section.locator("figure[data-testimonial-id]")).toBeVisible(); // featured quote
        } else {
          const perView = Math.min(vp.columnsFor(count), count);
          expect(await columns(page), `${vp.name} cards per view for ${count}`).toBe(perView);
          // Moves (and offers controls) only when there is more than fits.
          await expect(section.locator("[aria-roledescription=carousel]")).toHaveAttribute("data-autoplay", count > perView ? "on" : "off");
          await expect(section.getByRole("button", { name: "Next review" })).toHaveCount(count > perView ? 1 : 0);
        }
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${vp.name} horizontal overflow`).toBeLessThanOrEqual(0);
        await context.close();
      }
    });
  }

  test("carousel auto-advances, loops, pauses, and every review is reachable", async ({ page }) => {
    await page.clock.install();
    await setFixtures(8);
    await page.setViewportSize({ width: 1280, height: 900 });
    await page.goto("/");
    const section = page.locator("section[aria-labelledby=reviews-title]");
    await expect(section.locator("[data-testimonial-id]")).toHaveCount(8);
    await section.scrollIntoViewIfNeeded();
    await page.mouse.move(0, 0);
    expect(await firstInView(page)).toBe(0);

    // Moves one card on its own.
    await page.clock.runFor(6100);
    await expect.poll(() => firstInView(page)).toBe(1);

    // Hovering pauses it.
    await section.locator("[data-testimonial-track]").hover();
    await page.clock.runFor(13000);
    expect(await firstInView(page)).toBe(1);
    await page.mouse.move(0, 0);

    // Next/Previous, then loop from the last position (8 cards, 3 per view → last start is 5).
    await section.getByRole("button", { name: "Next review" }).click();
    await expect.poll(() => firstInView(page)).toBe(2);
    await section.getByRole("button", { name: "Previous review" }).click();
    await expect.poll(() => firstInView(page)).toBe(1);
    await section.getByRole("button", { name: "Show review 6" }).click();
    await expect.poll(() => firstInView(page)).toBe(5);
    await expect(section.locator("[data-testimonial-id]").last()).toBeInViewport();
    await section.getByRole("button", { name: "Next review" }).click();
    await expect.poll(() => firstInView(page)).toBe(0);

    // The Pause button stops it (WCAG 2.2.2).
    const pause = section.getByRole("button", { name: /Pause automatic scrolling/ });
    await pause.click();
    await expect(section.getByRole("button", { name: /Play automatic scrolling/ })).toHaveAttribute("aria-pressed", "true");
    await page.mouse.move(0, 0);
    await page.locator("body").focus();
    await page.clock.runFor(20000);
    expect(await firstInView(page)).toBe(0);
  });

  test("reduced motion: no automatic movement, buttons still work", async ({ browser }) => {
    await setFixtures(8);
    const context = await browser.newContext({ reducedMotion: "reduce", viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();
    await page.clock.install();
    await page.goto("/");
    const section = page.locator("section[aria-labelledby=reviews-title]");
    await section.scrollIntoViewIfNeeded();
    await expect(section.locator("[aria-roledescription=carousel]")).toHaveAttribute("data-autoplay", "off");
    await expect(section.getByRole("button", { name: /automatic scrolling/ })).toHaveCount(0);
    await page.mouse.move(0, 0);
    await page.clock.runFor(20000);
    expect(await firstInView(page)).toBe(0);
    await section.getByRole("button", { name: "Next review" }).click();
    await expect.poll(() => firstInView(page)).toBe(1);
    await context.close();
  });
});
