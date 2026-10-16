import { expect, test } from "@playwright/test";
import { humanPause, query, uniqueEmail } from "./helpers";

function futureDate(days: number): string {
  const d = new Date(Date.now() + days * 86_400_000);
  return d.toISOString().slice(0, 10);
}

test.describe("enquiries", () => {
  test("a visitor completes a custom trip, sees an estimate and gets a reference", async ({ page }) => {
    const email = uniqueEmail("trip");
    await page.goto("/trip-builder?destination=srinagar-dal-lake");

    // Step 1: route — Srinagar is preselected from the link; add Gulmarg and reorder.
    await expect(page.getByTestId("leg-0-destination")).toHaveValue(/.+/);
    await page.getByRole("button", { name: "Add a destination" }).click();
    await page.getByTestId("leg-1-destination").selectOption({ label: "Gulmarg" });
    await page.getByRole("button", { name: "More days at stop 2" }).click();
    await page.getByRole("button", { name: "Move stop 2 earlier" }).click();
    await expect(page.getByTestId("leg-0-destination").locator("option:checked")).toHaveText("Gulmarg");
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 2: dates & travellers — validation first.
    await page.getByRole("button", { name: "Continue" }).click();
    await expect(page.getByText("Please choose your arrival date.")).toBeVisible();
    await page.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(30));
    await page.getByRole("button", { name: "More children" }).click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 3: preferences
    await page.getByLabel("Deluxe (4-star or similar)").check();
    await page.getByLabel("Transport").selectOption("suv");
    await page.getByText("Snow, gondola & skiing").click();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 4: contact
    await page.getByLabel("Full name").fill("Asha Rao");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Phone or WhatsApp number").fill("+91 98765 43210");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await page.getByRole("button", { name: "Continue" }).click();

    // Step 5: review — values preserved; server estimate shown (2 adults + 1 child, 2 days each).
    await expect(page.getByText("Gulmarg (2 days) → Srinagar – Dal Lake (2 days)")).toBeVisible();
    await expect(page.getByTestId("estimate-total").first()).toHaveText("₹38,000");
    await humanPause(page);
    await page.getByRole("button", { name: "Send my trip request" }).click();

    const reference = (await page.getByTestId("enquiry-reference").textContent())!;
    expect(reference).toMatch(/^SWZ-\d{4}-[0-9A-Z]{5}$/);

    // Persisted, re-priced on the server, with notification jobs created.
    const [row] = await query<{ id: string; type: string; status: string; estimateTotalPaise: number; children: number }>(
      `SELECT id, type, status, "estimateTotalPaise", children FROM enquiry WHERE reference = $1`, [reference]);
    expect(row).toMatchObject({ type: "CUSTOM_TRIP", status: "NEW", estimateTotalPaise: 38000_00, children: 1 });
    const legs = await query<{ nameSnapshot: string }>(`SELECT "nameSnapshot" FROM enquiry_destination WHERE "enquiryId" = $1 ORDER BY position`, [row!.id]);
    expect(legs.map((l) => l.nameSnapshot)).toEqual(["Gulmarg", "Srinagar – Dal Lake"]);
    const emails = await query<{ kind: string }>(`SELECT kind FROM email_delivery WHERE "enquiryId" = $1 ORDER BY kind`, [row!.id]);
    expect(emails.map((e) => e.kind).sort()).toEqual(["CUSTOMER_ACKNOWLEDGEMENT", "INTERNAL_NOTIFICATION"]);
  });

  test("destinations without confirmed rates show 'Request a quote', never an invented price", async ({ page }) => {
    await page.goto("/trip-builder?destination=sonmarg");
    await page.getByRole("button", { name: "Continue" }).click();
    await page.getByRole("textbox", { name: /Arrival date/ }).fill(futureDate(40));
    await expect(page.getByTestId("estimate-quote").first()).toBeVisible();
    await expect(page.getByText("No published rate for Sonmarg on your dates.").first()).toBeVisible();
  });

  test("a visitor submits the contact form and the enquiry is saved", async ({ page }) => {
    const email = uniqueEmail("contact");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Rahul Mehta");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("We are four adults hoping to visit in April.");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    const reference = await page.getByTestId("enquiry-reference").textContent();
    const rows = await query(`SELECT type, status FROM enquiry WHERE reference = $1 AND email = $2`, [reference, email]);
    expect(rows).toEqual([{ type: "CONTACT", status: "NEW" }]);
  });

  test("invalid input is reported and nothing is saved", async ({ page }) => {
    await page.goto("/contact");
    await page.getByLabel("Email").fill("not-an-email");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Please check the highlighted fields." })).toBeVisible();
    await expect(page.getByText("Please enter a valid email address.")).toBeVisible();
    await expect(page.getByText("Please agree to the privacy notice")).toBeVisible();
    const rows = await query(`SELECT 1 FROM enquiry WHERE email = 'not-an-email'`);
    expect(rows).toHaveLength(0);
  });

  test("spam-like submissions are stored as spam with no emails sent", async ({ page }) => {
    const email = uniqueEmail("bot");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Bot");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("Buy cheap things at my website now!!!");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    // Bots fill hidden fields that people never see.
    await page.locator("input[name=swzCheck]").fill("http://spam.example", { force: true });
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByTestId("enquiry-reference")).toBeVisible();
    const [row] = await query<{ id: string; status: string }>(`SELECT id, status FROM enquiry WHERE email = $1`, [email]);
    expect(row!.status).toBe("SPAM");
    expect(await query(`SELECT 1 FROM email_delivery WHERE "enquiryId" = $1`, [row!.id])).toHaveLength(0);
  });

  test("a visitor checks an enquiry's status with reference and email only", async ({ page }) => {
    const email = uniqueEmail("track");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Priya Sharma");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("Can you suggest a five day plan?");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    const reference = (await page.getByTestId("enquiry-reference").textContent())!;

    await page.goto("/track");
    await page.getByLabel("Reference number").fill(reference.toLowerCase());
    await page.getByLabel("Email address").fill("someone-else@example.test");
    await page.getByRole("button", { name: "Check status" }).click();
    await expect(page.getByText("We could not find an enquiry")).toBeVisible();
    await page.getByLabel("Email address").fill(email);
    await page.getByRole("button", { name: "Check status" }).click();
    await expect(page.getByText("Received — our team will be in touch soon")).toBeVisible();
  });
});

test.describe("resilience", () => {
  test("double-clicking send creates exactly one enquiry", async ({ page }) => {
    const email = uniqueEmail("double");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Double Click");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("Clicking twice should not send twice.");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).dblclick();
    await expect(page.getByTestId("enquiry-reference")).toBeVisible();
    await page.waitForTimeout(1000);
    expect(await query(`SELECT 1 FROM enquiry WHERE email = $1`, [email])).toHaveLength(1);
  });

  test("a reload in the middle of the trip builder keeps the visitor's progress", async ({ page }) => {
    await page.goto("/trip-builder");
    await page.getByTestId("leg-0-destination").selectOption({ label: "Pahalgam" });
    await page.getByRole("button", { name: "More days at stop 1" }).click();
    await page.getByRole("button", { name: "Add a destination" }).click();
    await page.getByTestId("leg-1-destination").selectOption({ label: "Gulmarg" });
    await page.reload();
    await expect(page.getByTestId("leg-0-destination").locator("option:checked")).toHaveText("Pahalgam");
    await expect(page.getByTestId("leg-1-destination").locator("option:checked")).toHaveText("Gulmarg");
    await expect(page.getByRole("spinbutton", { name: "days at stop 1" })).toHaveValue("3");
  });
});
