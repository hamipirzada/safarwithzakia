import { expect, test } from "@playwright/test";
import { humanPause, query, uniqueEmail } from "./helpers";

test.describe("mobile", () => {
  test("navigation menu opens and closes", async ({ page }) => {
    await page.goto("/about");
    await page.getByRole("button", { name: "Open menu" }).click();
    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Packages" }).click();
    await expect(page).toHaveURL(/\/packages$/);
  });

  test("pages do not scroll sideways", async ({ page }) => {
    for (const path of ["/", "/trip-builder", "/packages/kashmir-honeymoon-delight", "/contact"]) {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(overflow, path).toBeLessThanOrEqual(0);
    }
  });

  test("the contact form is usable on a phone", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Mobile Visitor");
    await page.getByLabel("Email").fill(uniqueEmail("mobile"));
    await page.getByLabel("Your message").fill("Sending this from my phone.");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByTestId("enquiry-reference")).toBeVisible();
  });

  test("the trip builder's first steps work on a phone", async ({ page }) => {
    await page.goto("/trip-builder");
    await page.getByTestId("leg-0-destination").selectOption({ label: "Pahalgam" });
    await page.getByRole("button", { name: "More days at stop 1" }).tap();
    await page.getByRole("button", { name: "Continue" }).tap();
    await expect(page.getByRole("heading", { name: "When, and who is travelling?" })).toBeVisible();
  });
});

test.describe("mobile — long content", () => {
  test("very long names and descriptions wrap without sideways scrolling", async ({ page }) => {
    const id = Date.now().toString(36);
    const longName = `Extraordinarily Long Destination Name For Layout Testing ${id} Kashmir Valley`;
    const longTitle = `An Exceptionally Long Package Title That Goes On And On For Testing The Layout ${id}`;
    const [media] = await query<{ id: string }>(`SELECT id FROM media_asset ORDER BY path LIMIT 1`);
    const [d] = await query<{ id: string }>(
      `INSERT INTO destination (id, slug, name, summary, description, status, "heroImageId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 'PUBLISHED', $5, now()) RETURNING id`,
      [`long-${id}`, longName, "Summary ".repeat(30), "A long paragraph of text. ".repeat(200), media!.id],
    );
    const [p] = await query<{ id: string }>(
      `INSERT INTO package (id, slug, title, summary, description, "durationDays", "durationNights", status, "heroImageId", "updatedAt")
       VALUES (gen_random_uuid(), $1, $2, $3, $4, 2, 1, 'PUBLISHED', $5, now()) RETURNING id`,
      [`long-pkg-${id}`, longTitle, "Summary ".repeat(30), "Description text. ".repeat(300), media!.id],
    );
    await query(`INSERT INTO package_destination (id, "packageId", "destinationId", position, days) VALUES (gen_random_uuid(), $1, $2, 0, 2)`, [p!.id, d!.id]);
    try {
      for (const path of ["/destinations", `/destinations/long-${id}`, "/packages", `/packages/long-pkg-${id}`, "/"]) {
        await page.goto(path);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, path).toBeLessThanOrEqual(0);
      }
    } finally {
      await query(`UPDATE package SET status = 'ARCHIVED' WHERE id = $1`, [p!.id]);
      await query(`UPDATE destination SET status = 'ARCHIVED' WHERE id = $1`, [d!.id]);
    }
  });
});
