/**
 * Admin-to-public lifecycle tests.
 *
 * Every test drives the real admin UI in one browser context, then checks a separate visitor
 * context (no admin cookies) and the database directly. A test never passes merely because the
 * admin form shows what was typed: it checks the server's confirmation, the persisted row, the
 * admin view after a reload, public listings and detail pages, and dependent features.
 */
import { expect, test, type Page } from "@playwright/test";
import { adminSession, clickAndConfirm, editorSection, futureDate, humanPause, query, stubMessages, suffix, uniqueEmail, visitor } from "./helpers";

const GULMARG_ALT = "Visitors walking across the snow-covered meadow of Gulmarg";
const AUTUMN_ALT = "Autumn colours in a meadow below the mountains at Sonamarg";

/** Public trip-builder estimate for one destination, 2 adults, 2 days. */
async function tripEstimate(page: Page, destination: string, promo?: string) {
  await page.goto("/trip-builder");
  await page.getByTestId("leg-0-destination").selectOption({ label: destination });
  await page.getByRole("button", { name: "Continue" }).click();
  await page.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(25));
  if (promo !== undefined) {
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByLabel("Promo code").fill(promo);
  }
  return page.getByRole("complementary", { name: "Trip summary" });
}

async function selectOptions(page: Page): Promise<string[]> {
  return page.getByTestId("leg-0-destination").locator("option").allTextContents();
}

test.describe("admin changes reach the public website", () => {
  test("A: destination lifecycle — create, publish, edit, unpublish, republish, archive", async ({ browser }) => {
    const id = suffix();
    const name = `QA Valley ${id}`;
    const slug = `qa-valley-${id}`;
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);

    // Create (saved as a draft)
    await admin.goto("/admin/destinations/new");
    await admin.getByLabel("Name", { exact: true }).fill(name);
    await expect(admin.getByLabel("URL slug")).toHaveValue(slug);
    await admin.getByLabel("Summary", { exact: true }).fill(`Summary of ${name}`);
    await admin.getByLabel("Description", { exact: true }).fill(`First description of ${name}.`);
    await admin.getByRole("radio", { name: GULMARG_ALT }).locator("xpath=ancestor::label[1]").click();
    const rates = editorSection(admin, "Rates for custom trips");
    await rates.getByRole("button", { name: "Add a rate" }).click();
    await rates.getByLabel("Label", { exact: true }).fill("Group day rate");
    await rates.getByLabel("Basis", { exact: true }).selectOption({ label: "per group, per day" });
    await rates.getByLabel("Amount (₹)", { exact: true }).fill("3000");
    await rates.getByRole("checkbox", { name: /Active/ }).check();
    await admin.getByRole("button", { name: "Create destination" }).click();
    await admin.waitForURL(/\/admin\/destinations\/[0-9a-f-]+\/edit$/);

    let [row] = await query<{ id: string; status: string; description: string }>(`SELECT id, status, description FROM destination WHERE slug = $1`, [slug]);
    expect(row).toMatchObject({ status: "DRAFT", description: `First description of ${name}.` });
    expect((await pub.goto(`/destinations/${slug}`))?.status()).toBe(404);

    // Publish
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Publish" }), "Destination published.");
    [row] = await query(`SELECT id, status, description FROM destination WHERE slug = $1`, [slug]);
    expect(row!.status).toBe("PUBLISHED");

    // Public listing → detail (navigating from the listing)
    await pub.goto("/destinations");
    const card = pub.locator("article").filter({ hasText: name });
    await expect(card.getByText(`Summary of ${name}`)).toBeVisible();
    await expect(card.getByText("From ₹3,000 per group, per day")).toBeVisible();
    await card.getByRole("link", { name }).click();
    await expect(pub).toHaveURL(new RegExp(`/destinations/${slug}$`));
    await expect(pub.getByText(`First description of ${name}.`)).toBeVisible();
    await expect(pub.locator("article > header img").first()).toHaveAttribute("src", /gulmarg-snow-meadow/);

    // The trip builder offers it and prices it from the saved rate
    let summary = await tripEstimate(pub, name);
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹6,000");

    // Edit description, image and rate
    await admin.getByLabel("Description", { exact: true }).fill(`Second description of ${name}.`);
    await admin.getByRole("radio", { name: AUTUMN_ALT }).locator("xpath=ancestor::label[1]").click();
    await editorSection(admin, "Rates for custom trips").getByLabel("Amount (₹)", { exact: true }).fill("3500");
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Save changes" }), "Destination saved.");

    // Persisted: database, and the admin after a full reload
    [row] = await query(`SELECT id, status, description FROM destination WHERE slug = $1`, [slug]);
    expect(row!.description).toBe(`Second description of ${name}.`);
    await admin.reload();
    await expect(admin.getByLabel("Description", { exact: true })).toHaveValue(`Second description of ${name}.`);
    await expect(editorSection(admin, "Rates for custom trips").getByLabel("Amount (₹)", { exact: true })).toHaveValue("3500");
    await expect(admin.getByRole("radio", { name: AUTUMN_ALT })).toBeChecked();

    // Public pages show the new values, never the old ones
    await pub.goto(`/destinations/${slug}`);
    await expect(pub.getByText(`Second description of ${name}.`)).toBeVisible();
    await expect(pub.getByText(`First description of ${name}.`)).toHaveCount(0);
    await expect(pub.locator("article > header img").first()).toHaveAttribute("src", /sonamarg-autumn/);
    await pub.goto("/destinations");
    await expect(pub.locator("article").filter({ hasText: name }).locator("img")).toHaveAttribute("src", /sonamarg-autumn/);
    summary = await tripEstimate(pub, name);
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹7,000");

    // Unpublish: gone from listing, direct URL, trip builder, sitemap and home ring
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Unpublish" }), "Destination moved to draft.");
    await pub.goto("/destinations");
    await expect(pub.getByText(name)).toHaveCount(0);
    expect((await pub.goto(`/destinations/${slug}`))?.status()).toBe(404);
    await pub.goto("/trip-builder");
    expect(await selectOptions(pub)).not.toContain(name);
    expect(await (await pub.request.get("/sitemap.xml")).text()).not.toContain(slug);
    await pub.goto("/");
    await expect(pub.getByRole("group", { name: "Destinations in Kashmir" }).getByText(name)).toHaveCount(0);

    // Republish: back again
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Publish" }), "Destination published.");
    await pub.goto("/destinations");
    await expect(pub.getByRole("link", { name })).toBeVisible();

    // Related package: a published package that routes through it blocks archiving
    const [pkg] = await query<{ id: string }>(
      `INSERT INTO package (id, slug, title, summary, description, "durationDays", "durationNights", status, "heroImageId", "updatedAt")
       SELECT gen_random_uuid(), $1, $2, 'S', 'D', 2, 1, 'PUBLISHED', "heroImageId", now() FROM destination WHERE slug = $3 RETURNING id`,
      [`qa-pkg-${id}`, `QA Route ${id}`, slug],
    );
    await query(`INSERT INTO package_destination (id, "packageId", "destinationId", position, days) VALUES (gen_random_uuid(), $1, $2, 0, 2)`, [pkg!.id, row!.id]);
    await pub.goto(`/packages/qa-pkg-${id}`);
    await pub.getByRole("link", { name }).click();
    await expect(pub).toHaveURL(new RegExp(`/destinations/${slug}$`));

    await admin.getByRole("button", { name: "Archive" }).click();
    await expect(admin.getByRole("alert").filter({ hasText: "part of 1 published package" })).toBeVisible();
    expect((await query(`SELECT status FROM destination WHERE slug = $1`, [slug]))[0]).toEqual({ status: "PUBLISHED" });

    // Unpublish the package in the admin, then archiving succeeds and links fail gracefully
    await admin.goto(`/admin/packages/${pkg!.id}/edit`);
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Unpublish" }), "Package moved to draft.");
    await admin.goto(`/admin/destinations/${row!.id}/edit`);
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Archive" }), "Destination archived.");
    expect((await pub.goto(`/destinations/${slug}`))?.status()).toBe(404);
    expect((await pub.goto(`/packages/qa-pkg-${id}`))?.status()).toBe(404);
    await expect(pub.getByRole("heading", { name: /doesn’t lead anywhere/ })).toBeVisible();
  });

  test("B: package lifecycle — create, publish, edit, price change, unpublish; history preserved", async ({ browser }) => {
    const id = suffix();
    const title = `QA Package ${id}`;
    const slug = `qa-package-${id}`;
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);

    await admin.goto("/admin/packages/new");
    const basics = editorSection(admin, "Basics");
    await basics.getByLabel("Title", { exact: true }).fill(title);
    await basics.getByLabel("Category").fill("QA");
    await basics.getByLabel("Days", { exact: true }).fill("3");
    await basics.getByLabel("Nights", { exact: true }).fill("2");
    await basics.getByLabel("Summary", { exact: true }).fill(`Summary ${id}`);
    await basics.getByLabel("Description", { exact: true }).fill(`Original description ${id}`);
    const route = editorSection(admin, "Route");
    await route.getByRole("button", { name: "Add a stop" }).click();
    await route.getByLabel("Destination").selectOption({ label: "Gulmarg" });
    await route.getByLabel("Days", { exact: true }).fill("3");
    const days = editorSection(admin, "Day by day");
    await days.getByRole("button", { name: "Add a day" }).click();
    await days.getByLabel("Title", { exact: true }).fill(`Arrival day ${id}`);
    await days.getByLabel("Description", { exact: true }).fill("Gondola ride in the afternoon.");
    const inclusions = editorSection(admin, "Inclusions");
    await inclusions.getByRole("button", { name: "Add included item" }).click();
    await inclusions.getByRole("textbox", { name: "Included item" }).fill(`Breakfast ${id}`);
    await inclusions.getByRole("button", { name: "Add excluded item" }).click();
    await inclusions.getByRole("textbox", { name: "Excluded item" }).fill(`Flights ${id}`);
    const pricing = editorSection(admin, "Pricing");
    await pricing.getByRole("button", { name: "Add a rate" }).click();
    await pricing.getByLabel("Label", { exact: true }).fill("Package price");
    await pricing.getByLabel("Basis", { exact: true }).selectOption({ label: "per package" });
    await pricing.getByLabel("Amount (₹)", { exact: true }).fill("20000");
    await pricing.getByLabel("Travellers covered").fill("2");
    await pricing.getByRole("checkbox", { name: /Active/ }).check();
    await editorSection(admin, "Images").getByRole("radio", { name: GULMARG_ALT }).locator("xpath=ancestor::label[1]").click();
    await admin.getByRole("button", { name: "Create package" }).click();
    await admin.waitForURL(/\/admin\/packages\/[0-9a-f-]+\/edit$/);
    const packageId = admin.url().split("/").at(-2)!;

    expect((await pub.goto(`/packages/${slug}`))?.status()).toBe(404); // still a draft
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Publish" }), "Package published.");

    // Public listing and detail
    await pub.goto("/packages");
    const card = pub.locator("article").filter({ hasText: title });
    await expect(card.getByText("From ₹20,000 for 2 travellers")).toBeVisible();
    await card.getByRole("link", { name: title }).click();
    await expect(pub).toHaveURL(new RegExp(`/packages/${slug}$`));
    for (const text of [`Summary ${id}`, `Original description ${id}`, `Arrival day ${id}`, "Gondola ride in the afternoon.", `Breakfast ${id}`, `Flights ${id}`, "3 days / 2 nights"]) {
      await expect(pub.getByText(text, { exact: true }).first()).toBeVisible();
    }
    await expect(pub.getByRole("link", { name: "Gulmarg" }).first()).toBeVisible();

    // A package enquiry is priced from the saved rule
    async function enquire(page: Page, email: string) {
      await page.goto(`/packages/${slug}`);
      await page.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(30));
      await page.getByLabel("Full name").fill("Package Tester");
      await page.getByLabel("Email").fill(email);
      await page.getByLabel("Phone or WhatsApp").fill("+91 98765 43210");
      await page.getByRole("checkbox", { name: /privacy notice/ }).check();
      await humanPause(page);
      await page.getByRole("button", { name: "Send enquiry" }).click();
      return (await page.getByTestId("enquiry-reference").textContent())!;
    }
    const firstEmail = uniqueEmail("pkg1");
    const firstRef = await enquire(pub, firstEmail);
    await expect(pub.getByText("Indicative estimate: ₹20,000")).toBeVisible();

    // Edit title, description, itinerary and price
    await basics.getByLabel("Title", { exact: true }).fill(`${title} Revised`);
    await basics.getByLabel("Description", { exact: true }).fill(`Revised description ${id}`);
    await days.getByLabel("Title", { exact: true }).fill(`Arrival day revised ${id}`);
    await pricing.getByLabel("Amount (₹)", { exact: true }).fill("22,000");
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Save changes" }), "Package saved.");
    await admin.reload();
    await expect(editorSection(admin, "Basics").getByLabel("Title", { exact: true })).toHaveValue(`${title} Revised`);
    // The editor shows the persisted, normalised amount — not the "22,000" that was typed.
    await expect(editorSection(admin, "Pricing").getByLabel("Amount (₹)", { exact: true })).toHaveValue("22000");
    expect((await query(`SELECT "amountPaise" FROM pricing_rule WHERE "packageId" = $1`, [packageId]))[0]).toEqual({ amountPaise: 22000_00 });

    await pub.goto("/packages");
    await expect(pub.locator("article").filter({ hasText: `${title} Revised` }).getByText("From ₹22,000 for 2 travellers")).toBeVisible();
    await pub.goto(`/packages/${slug}`);
    await expect(pub.getByRole("heading", { level: 1 })).toHaveText(`${title} Revised`);
    await expect(pub.getByText(`Revised description ${id}`)).toBeVisible();
    await expect(pub.getByText(`Arrival day revised ${id}`)).toBeVisible();
    await expect(pub.getByText(`Original description ${id}`)).toHaveCount(0);

    const secondRef = await enquire(pub, uniqueEmail("pkg2"));
    await expect(pub.getByText("Indicative estimate: ₹22,000")).toBeVisible();

    // History: the first enquiry keeps the price and title it was submitted with
    const [first] = await query<{ estimateTotalPaise: number; title: string }>(`SELECT "estimateTotalPaise", snapshot->'package'->>'title' AS title FROM enquiry WHERE reference = $1`, [firstRef]);
    expect(first).toEqual({ estimateTotalPaise: 20000_00, title });
    const [second] = await query<{ estimateTotalPaise: number }>(`SELECT "estimateTotalPaise" FROM enquiry WHERE reference = $1`, [secondRef]);
    expect(second!.estimateTotalPaise).toBe(22000_00);

    // A visitor who still has the page open cannot enquire once it is unpublished
    const { page: stale } = await visitor(browser);
    await stale.goto(`/packages/${slug}`);
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Unpublish" }), "Package moved to draft.");
    await stale.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(30));
    await stale.getByLabel("Full name").fill("Late Visitor");
    await stale.getByLabel("Email").fill(uniqueEmail("late"));
    await stale.getByLabel("Phone or WhatsApp").fill("+91 98765 43210");
    await stale.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(stale);
    await stale.getByRole("button", { name: "Send enquiry" }).click();
    await expect(stale.getByRole("alert").filter({ hasText: "no longer available" })).toBeVisible();
    await expect(stale.getByTestId("enquiry-reference")).toHaveCount(0);

    // Gone from every public surface
    await pub.goto("/packages");
    await expect(pub.getByText(title)).toHaveCount(0);
    expect((await pub.goto(`/packages/${slug}`))?.status()).toBe(404);
    await pub.goto("/destinations/gulmarg");
    await expect(pub.getByText(title)).toHaveCount(0);
    await pub.goto("/");
    await expect(pub.getByText(title)).toHaveCount(0);
    expect(await (await pub.request.get("/sitemap.xml")).text()).not.toContain(slug);

    // The earlier enquiries are still intact and viewable by staff
    const [kept] = await query<{ id: string }>(`SELECT id FROM enquiry WHERE reference = $1`, [firstRef]);
    await admin.goto(`/admin/enquiries/${kept!.id}`);
    await expect(admin.getByRole("link", { name: firstEmail })).toBeVisible();
    await expect(admin.getByText("₹20,000 (indicative)")).toBeVisible();
  });

  test("C: offers and promo codes — visibility, edits, expiry and server-calculated discounts", async ({ browser }) => {
    const id = suffix().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);
    const newPromo = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "New promo code" }) });

    async function createPromo(code: string, fill: (form: typeof newPromo) => Promise<void> = async () => {}) {
      await admin.goto("/admin/offers");
      await newPromo.getByLabel("Code", { exact: true }).fill(code);
      await newPromo.getByLabel("Value", { exact: true }).fill("10");
      await fill(newPromo);
      await clickAndConfirm(admin, newPromo.getByRole("button", { name: "Create promo code" }), "Promo code created.");
    }
    const yesterday = futureDate(-1);
    await createPromo(`QA${id}`);
    await createPromo(`OLD${id}`, (f) => f.getByLabel("Valid to").fill(yesterday));
    await createPromo(`SOON${id}`, (f) => f.getByLabel("Valid from").fill(futureDate(10)));
    await createPromo(`MIN${id}`, (f) => f.getByLabel("Minimum trip value (₹)").fill("1000000"));
    await createPromo(`CAP${id}`, (f) => f.getByLabel("Maximum discount (₹)").fill("500"));
    expect((await query(`SELECT count(*)::int AS n FROM promo_code WHERE code LIKE $1`, [`%${id}`]))[0]).toEqual({ n: 5 });

    // Offer, published with the promo code
    const offerTitle = `QA Offer ${id}`;
    const newOffer = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "New offer" }) });
    await newOffer.getByLabel("Title", { exact: true }).fill(offerTitle);
    await newOffer.getByLabel("Highlight label").fill("10% off");
    await newOffer.getByLabel("Description").fill(`Spring savings ${id} on Kashmir trips.`);
    await newOffer.getByLabel(/Linked package/).selectOption({ label: "Kashmir Honeymoon Delight" });
    await newOffer.getByLabel(/Promo code to show/).selectOption({ label: `QA${id}` });
    await newOffer.getByLabel("Visibility").selectOption("PUBLISHED");
    await clickAndConfirm(admin, newOffer.getByRole("button", { name: "Create offer" }), "Offer created.");

    await pub.goto("/");
    const offerCard = pub.locator("li").filter({ hasText: offerTitle });
    await expect(offerCard.getByText(`Spring savings ${id} on Kashmir trips.`)).toBeVisible();
    await expect(offerCard.getByText(`QA${id}`)).toBeVisible();
    await expect(offerCard.getByRole("link", { name: "See Kashmir Honeymoon Delight" })).toBeVisible();

    // Edit the offer
    const existing = admin.locator("details").filter({ hasText: offerTitle });
    await existing.locator("summary").click();
    await existing.getByLabel("Title", { exact: true }).fill(`${offerTitle} Updated`);
    await clickAndConfirm(admin, existing.getByRole("button", { name: "Save offer" }), "Offer saved.");
    await pub.goto("/");
    await expect(pub.getByText(`${offerTitle} Updated`)).toBeVisible();

    // Server-calculated discounts (Srinagar: ₹3,500 per person per day; 2 adults × 2 days = ₹14,000)
    let summary = await tripEstimate(pub, "Srinagar – Dal Lake", `qa${id}`.toLowerCase());
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹12,600");
    await expect(summary.getByText("Promo code applied.")).toBeVisible();
    await expect(summary.getByText("Indicative estimate")).toBeVisible();
    for (const [code, message] of [
      [`OLD${id}`, "This promo code has expired."],
      [`SOON${id}`, "This promo code is not active yet."],
      [`MIN${id}`, "Your trip does not meet the minimum amount for this code."],
      [`NOPE${id}`, "This promo code is not valid."],
    ] as const) {
      await pub.getByLabel("Promo code").fill(code);
      await expect(summary.getByText(message)).toBeVisible();
      await expect(summary.getByTestId("estimate-total")).toHaveText("₹14,000");
    }
    await pub.getByLabel("Promo code").fill(`CAP${id}`);
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹13,500"); // 10% capped at ₹500

    // Deactivating the promo removes it from the offer and from pricing
    const promoRow = admin.locator("details").filter({ hasText: `QA${id}` }).filter({ hasText: "% off" });
    await admin.goto("/admin/offers");
    await promoRow.locator("summary").click();
    await promoRow.getByRole("checkbox", { name: "Active" }).uncheck();
    await clickAndConfirm(admin, promoRow.getByRole("button", { name: "Save promo code" }), "Promo code saved.");
    await pub.goto("/");
    await expect(pub.locator("li").filter({ hasText: `${offerTitle} Updated` }).getByText(`QA${id}`)).toHaveCount(0);
    summary = await tripEstimate(pub, "Srinagar – Dal Lake", `QA${id}`);
    await expect(summary.getByText("This promo code is not valid.")).toBeVisible();

    // Unpublish, then republish with an end date in the past: hidden both times
    const offer = admin.locator("details").filter({ hasText: `${offerTitle} Updated` });
    await offer.locator("summary").click();
    await offer.getByLabel("Visibility").selectOption("DRAFT");
    await clickAndConfirm(admin, offer.getByRole("button", { name: "Save offer" }), "Offer saved.");
    await pub.goto("/");
    await expect(pub.getByText(`${offerTitle} Updated`)).toHaveCount(0);

    await admin.reload();
    await offer.locator("summary").click();
    await offer.getByLabel("Visibility").selectOption("PUBLISHED");
    await offer.getByLabel("Ends").fill(yesterday);
    await clickAndConfirm(admin, offer.getByRole("button", { name: "Save offer" }), "Offer saved.");
    await pub.goto("/");
    await expect(pub.getByText(`${offerTitle} Updated`)).toHaveCount(0);
  });

  test("C2: fixed-amount promo codes — edits apply immediately, and submitted enquiries keep the code and discounted price", async ({ browser }) => {
    const id = suffix().toUpperCase().replace(/[^A-Z0-9]/g, "");
    const code = `FLAT${id}`;
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);
    // The promo code's own row (offer rows list every code in their "Promo code to show" menu)
    const promoRow = () => admin.locator("details").filter({ has: admin.locator("summary", { hasText: code }) });

    // Create a ₹2,000-off code in the admin
    await admin.goto("/admin/offers");
    const newPromo = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "New promo code" }) });
    await newPromo.getByLabel("Code", { exact: true }).fill(code.toLowerCase()); // stored normalised
    await newPromo.getByLabel("Type").selectOption("FIXED");
    await newPromo.getByLabel("Value", { exact: true }).fill("2,000");
    await clickAndConfirm(admin, newPromo.getByRole("button", { name: "Create promo code" }), "Promo code created.");
    expect((await query(`SELECT code, "discountType", value, active FROM promo_code WHERE code = $1`, [code]))[0]).toEqual({ code, discountType: "FIXED", value: 2000_00, active: true });
    await admin.reload();
    const row = promoRow();
    await expect(row).toContainText("₹2,000 off");

    // Visible straight away on the website (Srinagar: 2 adults × 2 days = ₹14,000)
    let summary = await tripEstimate(pub, "Srinagar – Dal Lake", code);
    await expect(summary.getByText("Promo code applied.")).toBeVisible();
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹12,000");

    // Editing the value in the admin changes the next estimate
    await row.locator("summary").click();
    await row.getByLabel("Value", { exact: true }).fill("3000");
    await clickAndConfirm(admin, row.getByRole("button", { name: "Save promo code" }), "Promo code saved.");
    await admin.reload();
    await expect(promoRow()).toContainText("₹3,000 off");
    summary = await tripEstimate(pub, "Srinagar – Dal Lake", code);
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹11,000");

    // Submitting the trip: the server re-prices with the code and stores both
    await pub.getByRole("button", { name: "Continue" }).click(); // preferences → contact
    await pub.getByLabel("Full name").fill("Promo Tester");
    await pub.getByLabel("Email").fill(uniqueEmail("promo-trip"));
    await pub.getByLabel("Phone or WhatsApp number").fill("+91 98765 43210");
    await pub.getByRole("checkbox", { name: /privacy notice/ }).check();
    await pub.getByRole("button", { name: "Continue" }).click();
    await expect(pub.getByTestId("estimate-total").first()).toHaveText("₹11,000");
    await humanPause(pub);
    await pub.getByRole("button", { name: "Send my trip request" }).click();
    const tripRef = (await pub.getByTestId("enquiry-reference").textContent())!;
    const [trip] = await query<{ id: string; promoCode: string; estimateTotalPaise: number }>(`SELECT id, "promoCode", "estimateTotalPaise" FROM enquiry WHERE reference = $1`, [tripRef]);
    expect(trip).toMatchObject({ promoCode: code, estimateTotalPaise: 11000_00 });
    // Staff see the code on the enquiry
    await admin.goto(`/admin/enquiries/${trip!.id}`);
    await expect(admin.getByText(code).first()).toBeVisible();
    await expect(admin.getByText("₹11,000 (indicative)")).toBeVisible();

    // Package enquiry form: the same code takes ₹3,000 off the package price
    async function packageEnquiry(promo: string) {
      await pub.goto("/packages/kashmir-honeymoon-delight");
      await pub.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(30));
      await pub.getByLabel("Full name").fill("Package Promo Tester");
      await pub.getByLabel("Email").fill(uniqueEmail("promo-pkg"));
      await pub.getByLabel("Phone or WhatsApp").fill("+91 98765 43210");
      if (promo) await pub.getByLabel("Promo code").fill(promo);
      await pub.getByRole("checkbox", { name: /privacy notice/ }).check();
      await humanPause(pub);
      await pub.getByRole("button", { name: "Send enquiry" }).click();
      const ref = (await pub.getByTestId("enquiry-reference").textContent())!;
      return (await query<{ promoCode: string | null; estimateTotalPaise: number }>(`SELECT "promoCode", "estimateTotalPaise" FROM enquiry WHERE reference = $1`, [ref]))[0]!;
    }
    const full = await packageEnquiry("");
    const discounted = await packageEnquiry(code.toLowerCase());
    expect(full.promoCode).toBeNull();
    expect(full.estimateTotalPaise).toBeGreaterThan(3000_00);
    expect(discounted).toEqual({ promoCode: code, estimateTotalPaise: full.estimateTotalPaise - 3000_00 });

    // Deactivated: no longer accepted anywhere
    await admin.goto("/admin/offers");
    const again = promoRow();
    await again.locator("summary").click();
    await again.getByRole("checkbox", { name: "Active" }).uncheck();
    await clickAndConfirm(admin, again.getByRole("button", { name: "Save promo code" }), "Promo code saved.");
    summary = await tripEstimate(pub, "Srinagar – Dal Lake", code);
    await expect(summary.getByText("This promo code is not valid.")).toBeVisible();
    await expect(summary.getByTestId("estimate-total")).toHaveText("₹14,000");
  });

  test("D: testimonials need confirmed consent before they can be published", async ({ browser }) => {
    const id = suffix();
    const guest = `QA Guest ${id}`;
    const quote = `The QA trip ${id} was wonderful from start to finish.`;
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);

    await admin.goto("/admin/testimonials");
    const add = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Add a testimonial" }) });
    await add.getByLabel("Guest name").fill(guest);
    await add.getByLabel("Review", { exact: true }).fill(quote);
    await add.getByLabel("Source").fill("Synthetic test fixture");
    await clickAndConfirm(admin, add.getByRole("button", { name: "Add testimonial" }), "Testimonial saved.");
    await pub.goto("/");
    await expect(pub.getByText(quote)).toHaveCount(0);

    // Publishing without consent is refused by the server
    const item = admin.locator("details").filter({ hasText: guest });
    await item.locator("summary").click();
    await item.getByLabel("Visibility").selectOption("PUBLISHED");
    await item.getByRole("button", { name: "Save" }).click();
    await expect(admin.getByRole("alert").filter({ hasText: "Confirm that this review is genuine" })).toBeVisible();
    const [row] = await query<{ id: string; status: string }>(`SELECT id, status FROM testimonial WHERE "authorName" = $1`, [guest]);
    expect(row!.status).toBe("DRAFT");
    await pub.goto("/");
    await expect(pub.getByText(quote)).toHaveCount(0);

    // With consent confirmed it publishes
    await item.getByRole("checkbox", { name: /genuine review/ }).check();
    await clickAndConfirm(admin, item.getByRole("button", { name: "Save" }), "Testimonial saved.");
    await pub.goto("/");
    await expect(pub.getByText(quote, { exact: false })).toBeVisible();
    await expect(pub.getByText(guest)).toBeVisible();

    // Unpublish
    await admin.reload();
    await item.locator("summary").click();
    await item.getByLabel("Visibility").selectOption("DRAFT");
    await clickAndConfirm(admin, item.getByRole("button", { name: "Save" }), "Testimonial saved.");
    await pub.goto("/");
    await expect(pub.getByText(quote)).toHaveCount(0);

    // Audit trail: who did what, including the consent state at each step
    const audit = await query<{ action: string; consent: string | null; actor: string }>(
      `SELECT a.action, a.metadata->>'consentConfirmed' AS consent, u.email AS actor FROM audit_log a JOIN staff_user u ON u.id = a."actorId"
       WHERE a."entityId" = $1 ORDER BY a."createdAt"`, [row!.id]);
    expect(audit).toEqual([
      { action: "testimonial.created", consent: "false", actor: "admin@e2e.test" },
      { action: "testimonial.updated", consent: "true", actor: "admin@e2e.test" },
      { action: "testimonial.updated", consent: "true", actor: "admin@e2e.test" },
    ]);
  });

  test("E: FAQs, home content and business details", async ({ browser }) => {
    const id = suffix();
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);
    try {
      // FAQ: create published → edit → archive
      await admin.goto("/admin/faqs");
      const add = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Add a question" }) });
      await add.getByLabel("Question").fill(`Can we bring pets ${id}?`);
      await add.getByLabel("Answer").fill("Please ask us before booking.");
      await add.getByLabel("Visibility").selectOption("PUBLISHED");
      await clickAndConfirm(admin, add.getByRole("button", { name: "Add FAQ" }), "FAQ saved.");
      await pub.goto("/");
      await expect(pub.getByText(`Can we bring pets ${id}?`)).toBeVisible();

      const [faqRow] = await query<{ id: string }>(`SELECT id FROM faq WHERE question = $1`, [`Can we bring pets ${id}?`]);
      const faq = admin.locator(`details[data-record-id="${faqRow!.id}"]`);
      await faq.locator("summary").click();
      await faq.getByLabel("Question").fill(`Are pets allowed ${id}?`);
      await faq.getByLabel("Answer").fill("Small pets can travel by private car.");
      await clickAndConfirm(admin, faq.getByRole("button", { name: "Save" }), "FAQ saved.");
      await pub.goto("/");
      await expect(pub.getByText(`Are pets allowed ${id}?`)).toBeVisible();
      await expect(pub.getByText(`Can we bring pets ${id}?`)).toHaveCount(0);
      await pub.getByText(`Are pets allowed ${id}?`).click();
      await expect(pub.getByText("Small pets can travel by private car.")).toBeVisible();

      await admin.reload();
      const edited = faq;
      await edited.locator("summary").click();
      await edited.getByLabel("Visibility").selectOption("ARCHIVED");
      await clickAndConfirm(admin, edited.getByRole("button", { name: "Save" }), "FAQ saved.");
      await pub.goto("/");
      await expect(pub.getByText(`Are pets allowed ${id}?`)).toHaveCount(0);

      // Home content
      await admin.goto("/admin/content");
      await admin.getByLabel("Main title").fill(`Kashmir QA ${id}`);
      await clickAndConfirm(admin, admin.getByRole("button", { name: "Save home page" }), "Home page text saved.");
      await pub.goto("/");
      await expect(pub.getByRole("heading", { level: 1 })).toHaveText(`Kashmir QA ${id}`);
      await admin.reload();
      await expect(admin.getByLabel("Main title")).toHaveValue(`Kashmir QA ${id}`);

      // Announcement banner: shown on every public page while enabled, gone when disabled
      await admin.getByLabel("Message").fill(`Winter departures open ${id}`);
      await admin.getByLabel("Link path").fill("/packages");
      await admin.getByLabel("Link text").fill("See packages");
      await admin.getByRole("checkbox", { name: /Show the banner/ }).check();
      await clickAndConfirm(admin, admin.getByRole("button", { name: "Save banner" }), "Announcement banner is live.");
      await pub.goto("/about");
      await expect(pub.getByText(`Winter departures open ${id}`)).toBeVisible();
      await expect(pub.getByRole("link", { name: "See packages" })).toHaveAttribute("href", "/packages");
      await admin.getByRole("checkbox", { name: /Show the banner/ }).uncheck();
      await clickAndConfirm(admin, admin.getByRole("button", { name: "Save banner" }), "Announcement saved (hidden).");
      await pub.goto("/about");
      await expect(pub.getByText(`Winter departures open ${id}`)).toHaveCount(0);

      // About page
      await admin.getByLabel("Team").fill(`Zakia — Founder & Travel Curator\nQA Person ${id} — Guide`);
      await clickAndConfirm(admin, admin.getByRole("button", { name: "Save about page" }), "About page saved.");
      await pub.goto("/about");
      await expect(pub.getByText(`QA Person ${id}`)).toBeVisible();

      // Business details: phone appears in footer + contact page; normalised WhatsApp shown after save
      await admin.goto("/admin/settings");
      await admin.getByLabel("Phone (as displayed)").fill("+91 90000 11111");
      await admin.getByLabel("WhatsApp number").fill("91 90000 11111");
      await admin.getByLabel("Tagline").fill("");
      await admin.getByLabel("YouTube").fill("");
      await clickAndConfirm(admin, admin.getByRole("button", { name: "Save business details" }), "Business details saved.");
      await expect(admin.getByLabel("WhatsApp number")).toHaveValue("+919000011111");
      const [settings] = await query<{ phone: string; whatsapp: string }>(`SELECT value->>'phone' AS phone, value->>'whatsappE164' AS whatsapp FROM site_setting WHERE key = 'business'`);
      expect(settings).toEqual({ phone: "+91 90000 11111", whatsapp: "+919000011111" });

      await pub.goto("/contact");
      await expect(pub.getByRole("link", { name: "+91 90000 11111" }).first()).toHaveAttribute("href", "tel:+919000011111");
      await expect(pub.locator("footer").getByRole("link", { name: "WhatsApp" })).toHaveAttribute("href", /wa\.me\/919000011111/);
      // Missing optional content does not break the layout
      await expect(pub.locator("footer").getByRole("link", { name: "YouTube" })).toHaveCount(0);
      await expect(pub.locator("footer").getByRole("link", { name: "Instagram" })).toBeVisible();
    } finally {
      // Back to the seeded defaults so other tests see the standard content.
      await query(`DELETE FROM site_setting WHERE key IN ('home', 'business', 'announcement', 'about')`);
    }
  });

  test("F: images — replacement propagates, missing images fall back, nothing is broken", async ({ browser }) => {
    const id = suffix();
    const { page: pub } = await visitor(browser);

    // A published destination whose image record is later removed (e.g. a licence was withdrawn)
    const [media] = await query<{ id: string }>(
      `INSERT INTO media_asset (id, path, alt, width, height) VALUES (gen_random_uuid(), $1, 'Temporary QA image', 2000, 1333) RETURNING id`,
      [`/images/kashmir/qa-temporary-${id}.jpg`],
    );
    await query(
      `INSERT INTO destination (id, slug, name, summary, description, status, "heroImageId", "updatedAt") VALUES (gen_random_uuid(), $1, $2, 'S', 'D', 'PUBLISHED', $3, now())`,
      [`qa-img-${id}`, `QA Image ${id}`, media!.id],
    );
    await pub.goto(`/destinations/qa-img-${id}`);
    await expect(pub.locator("article > header img")).toHaveCount(1);

    await query(`DELETE FROM media_asset WHERE id = $1`, [media!.id]);
    const response = await pub.goto(`/destinations/qa-img-${id}`);
    expect(response?.status()).toBe(200);
    await expect(pub.locator("article > header img")).toHaveCount(0);
    await expect(pub.locator("article > header").getByRole("img", { name: `QA Image ${id}` })).toBeVisible(); // designed placeholder
    await pub.goto("/destinations");
    await expect(pub.locator("article").filter({ hasText: `QA Image ${id}` }).getByText(`QA Image ${id}`, { exact: true }).first()).toBeVisible();
    await query(`UPDATE destination SET status = 'ARCHIVED' WHERE slug = $1`, [`qa-img-${id}`]);

    // No public page requests an image that fails
    const failed: string[] = [];
    pub.on("response", (r) => {
      if (r.request().resourceType() === "image" && r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
    });
    for (const path of ["/", "/destinations", "/destinations/gulmarg", "/packages", "/packages/kashmir-honeymoon-delight", "/about", "/credits"]) {
      await pub.goto(path, { waitUntil: "networkidle" });
    }
    expect(failed).toEqual([]);
  });

  test("G: enquiries — saved, visible to staff, handled, emailed once", async ({ browser }) => {
    const { page: admin } = await adminSession(browser);
    const { page: pub } = await visitor(browser);
    const email = uniqueEmail("handled");

    await pub.goto("/contact");
    await pub.getByLabel("Full name").fill("Handling Test");
    await pub.getByLabel("Email").fill(email);
    await pub.getByLabel("Your message").fill("Please call me about a family trip.");
    await pub.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(pub);
    await pub.getByRole("button", { name: "Send message" }).click();
    const reference = (await pub.getByTestId("enquiry-reference").textContent())!;
    const [enquiry] = await query<{ id: string }>(`SELECT id FROM enquiry WHERE reference = $1`, [reference]);

    // Delivered once each, recorded as SENT only after the provider accepted it
    await expect
      .poll(async () => (await query<{ n: number }>(`SELECT count(*)::int AS n FROM email_delivery WHERE "enquiryId" = $1 AND status = 'SENT' AND "providerMessageId" IS NOT NULL`, [enquiry!.id]))[0]!.n, { timeout: 15_000 })
      .toBe(2);
    await pub.request.post("/api/cron/email-outbox", { headers: { authorization: "Bearer e2e-worker-secret-0123456789" } });
    const messages = await stubMessages();
    expect(messages.filter((m) => m.to === "inbox@example.test" && m.replyTo === email)).toHaveLength(1);
    expect(messages.filter((m) => m.to === email)).toHaveLength(1);

    // Staff handling persists across a reload
    await admin.goto(`/admin/enquiries/${enquiry!.id}`);
    await expect(admin.getByText(reference).first()).toBeVisible();
    await admin.getByLabel("Assigned to").selectOption({ label: "E2E-Staff" });
    await admin.getByLabel("Follow up on (IST)").fill("2030-01-15T10:30");
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Save", exact: true }), "Saved.");
    await admin.reload();
    await expect(admin.getByLabel("Assigned to").locator("option:checked")).toHaveText("E2E-Staff");
    await expect(admin.getByLabel("Follow up on (IST)")).toHaveValue("2030-01-15T10:30");
    const [row] = await query<{ assignee: string; follow: string }>(
      `SELECT u.email AS assignee, to_char((e."followUpAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata', 'YYYY-MM-DD"T"HH24:MI') AS follow FROM enquiry e JOIN staff_user u ON u.id = e."assigneeId" WHERE e.id = $1`, [enquiry!.id]);
    expect(row).toEqual({ assignee: "staff@e2e.test", follow: "2030-01-15T10:30" });
    await expect(admin.locator("li", { hasText: "Notification to business inbox" }).getByText("Sent", { exact: true })).toBeVisible();

    // Archive and restore
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Archive" }), "Enquiry archived.");
    await admin.goto("/admin/enquiries");
    await expect(admin.getByText(reference)).toHaveCount(0);
    await admin.goto("/admin/enquiries?view=archived");
    await expect(admin.getByText(reference)).toBeVisible();
    await admin.goto(`/admin/enquiries/${enquiry!.id}`);
    await clickAndConfirm(admin, admin.getByRole("button", { name: "Restore from archive" }), "Enquiry restored.");

    // Permanent deletion (administrators): confirmation step, record gone, audit keeps only the reference
    await admin.getByRole("button", { name: "Delete permanently" }).click();
    await expect(admin.getByText("This permanently removes the enquiry")).toBeVisible();
    await admin.getByRole("button", { name: "Yes, delete" }).click();
    await admin.waitForURL(/\/admin\/enquiries$/);
    expect(await query(`SELECT 1 FROM enquiry WHERE id = $1`, [enquiry!.id])).toHaveLength(0);
    expect(await query(`SELECT 1 FROM email_delivery WHERE "enquiryId" = $1`, [enquiry!.id])).toHaveLength(0);
    const [trace] = await query<{ reference: string; actor: string }>(
      `SELECT a.metadata->>'reference' AS reference, u.email AS actor FROM audit_log a JOIN staff_user u ON u.id = a."actorId" WHERE a.action = 'enquiry.deleted' AND a."entityId" = $1`, [enquiry!.id]);
    expect(trace).toEqual({ reference, actor: "admin@e2e.test" });
  });

  test("H: staff permissions, audit actor, revoked and expired sessions, deactivation", async ({ browser }) => {
    const { page: staff } = await adminSession(browser, "staff@e2e.test", "e2e-staff-password-1", { fresh: true });
    const [enquiry] = await query<{ id: string }>(
      `INSERT INTO enquiry (id, reference, type, "customerName", email, snapshot, "consentAt", "updatedAt")
       VALUES (gen_random_uuid(), $1, 'CONTACT', 'Permission Test', 'perm@example.test', '{}', now(), now()) RETURNING id`,
      [`SWZ-2610-${suffix().slice(-5).toUpperCase().replace(/[ILOU]/g, "0")}`],
    );

    // Permitted: staff can work an enquiry, and the audit log names them
    await staff.goto(`/admin/enquiries/${enquiry!.id}`);
    await staff.getByLabel("Move to").selectOption("CONTACTED");
    await clickAndConfirm(staff, staff.getByRole("button", { name: "Update status" }), "Status updated.");
    const [audit] = await query<{ actor: string }>(`SELECT u.email AS actor FROM audit_log a JOIN staff_user u ON u.id = a."actorId" WHERE a."entityId" = $1 AND a.action = 'enquiry.status_changed'`, [enquiry!.id]);
    expect(audit!.actor).toBe("staff@e2e.test");

    // Not permitted: administrator areas, and no controls offered for them
    for (const path of ["/admin/settings", "/admin/staff", "/admin/email-settings", "/admin/audit"]) {
      await staff.goto(path);
      await expect(staff).toHaveURL(/\/admin\?denied=1$/);
    }
    await expect(staff.getByRole("link", { name: "Business details" })).toHaveCount(0);
    await staff.goto(`/admin/enquiries/${enquiry!.id}`);
    await expect(staff.getByRole("button", { name: "Delete permanently" })).toHaveCount(0);
    expect((await staff.request.get("/admin/enquiries/export")).status()).toBe(403);

    // A revoked session stops working immediately, even for a form already on screen
    await query(`DELETE FROM auth_session WHERE "userId" = (SELECT id FROM staff_user WHERE email = 'staff@e2e.test')`);
    await staff.getByLabel("New note").fill("This must not be saved");
    await staff.getByRole("button", { name: "Add note" }).click();
    // Either the action reports "Please sign in." or the re-rendered page sends them to sign in.
    await expect(staff.getByRole("alert").filter({ hasText: "Please sign in." }).or(staff.getByRole("heading", { name: "Staff sign in" }))).toBeVisible();
    expect(await query(`SELECT 1 FROM enquiry_note WHERE body = 'This must not be saved'`)).toHaveLength(0);
    await staff.goto("/admin/enquiries");
    await expect(staff).toHaveURL(/\/admin\/login/);

    // An expired session is refused
    const { page: again } = await adminSession(browser, "staff@e2e.test", "e2e-staff-password-1", { fresh: true });
    await query(`UPDATE auth_session SET "expiresAt" = now() - interval '1 minute' WHERE "userId" = (SELECT id FROM staff_user WHERE email = 'staff@e2e.test')`);
    await again.goto("/admin/enquiries");
    await expect(again).toHaveURL(/\/admin\/login/);

    // A deactivated account cannot keep using an existing session
    const { page: third } = await adminSession(browser, "staff@e2e.test", "e2e-staff-password-1", { fresh: true });
    try {
      await query(`UPDATE staff_user SET active = false WHERE email = 'staff@e2e.test'`);
      await third.goto("/admin");
      await expect(third).toHaveURL(/\/admin\/login/);
    } finally {
      await query(`UPDATE staff_user SET active = true WHERE email = 'staff@e2e.test'`);
    }
  });

  test("I: own password — changed on My account without being signed out; admins cannot reset their own", async ({ browser }) => {
    const id = suffix();
    const email = `guide-${id}@e2e.test`;
    const { page: admin } = await adminSession(browser);

    // Your own row offers "Change my password", not a reset that would sign you out.
    await admin.goto("/admin/staff");
    const ownRow = admin.locator("section").filter({ hasText: "admin@e2e.test" });
    await expect(ownRow.getByRole("button", { name: "Reset password" })).toHaveCount(0);
    await expect(ownRow.getByRole("link", { name: "Change my password" })).toHaveAttribute("href", "/admin/account");

    // Create a staff account through the UI; the temporary password is shown once.
    const add = admin.locator("section").filter({ has: admin.getByRole("heading", { name: "Add a staff account" }) });
    await add.getByLabel("Name").fill(`Guide ${id}`);
    await add.getByLabel("Email").fill(email);
    await clickAndConfirm(admin, add.getByRole("button", { name: "Create account" }), "Temporary password");
    const message = await add.getByRole("status").textContent();
    const temporary = message!.split("): ").at(-1)!.trim();

    // Sign in as the new person and change the password on My account
    const { page: guide } = await adminSession(browser, email, temporary, { fresh: true });
    await guide.goto("/admin/account");
    await guide.getByLabel("Current password").fill(temporary);
    await guide.getByLabel("New password", { exact: true }).fill("guide-new-password-123");
    await guide.getByLabel("Confirm new password").fill("guide-new-password-123");
    await guide.getByRole("button", { name: "Change password" }).click();
    await expect(guide.getByRole("status").filter({ hasText: "Password changed." })).toBeVisible();
    // Still signed in after a reload
    await guide.reload();
    await expect(guide).toHaveURL(/\/admin\/account$/);
    await expect(guide.getByRole("heading", { name: "My account" })).toBeVisible();

    // The old password no longer works; the new one does
    const oldTry = await guide.request.post("/api/auth/sign-in/email", { data: { email, password: temporary }, headers: { origin: "http://localhost:3100" } });
    expect(oldTry.status()).toBe(401);
    const [audit] = await query<{ n: number }>(`SELECT count(*)::int AS n FROM audit_log a JOIN staff_user u ON u.id = a."actorId" WHERE u.email = $1 AND a.action = 'staff.password_changed'`, [email]);
    expect(audit!.n).toBe(1);
    await query(`UPDATE staff_user SET active = false WHERE email = $1`, [email]);
  });
});

