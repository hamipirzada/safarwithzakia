import { expect, test } from "@playwright/test";
import { humanPause, login, query, signInAdmin, stubControl, stubMessages, uniqueEmail } from "./helpers";

test.describe("admin", () => {
  test("unauthorised visitors cannot reach admin pages or data", async ({ page, request }) => {
    await page.goto("/admin/enquiries");
    await expect(page).toHaveURL(/\/admin\/login\?next=%2Fadmin%2Fenquiries/);
    expect((await request.get("/admin/enquiries/export", { maxRedirects: 0 })).status()).toBe(307);
    // Even with a forged cookie, the server checks the session itself.
    const forged = await request.get("/admin/enquiries/export", { headers: { cookie: "swz.session_token=forged" } });
    expect(forged.status()).toBe(401);
    const cron = await request.post("/api/cron/email-outbox");
    expect(cron.status()).toBe(401);
    const signUp = await request.post("/api/auth/sign-up/email", { data: { email: "x@example.test", password: "long-password-123", name: "X" } });
    expect(signUp.ok()).toBe(false);
  });

  test("staff accounts cannot open administrator-only pages", async ({ page }) => {
    await login(page, "staff@e2e.test", "e2e-staff-password-1");
    await page.goto("/admin/staff");
    await expect(page).toHaveURL(/\/admin\?denied=1/);
    await expect(page.getByRole("link", { name: "Staff" })).toHaveCount(0);
  });

  test("an administrator views an enquiry, updates its status and adds a note", async ({ page }) => {
    const email = uniqueEmail("admin-flow");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Meera Khan");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("Honeymoon in December, please advise.");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    const reference = (await page.getByTestId("enquiry-reference").textContent())!;

    await signInAdmin(page);
    await page.locator("aside").getByRole("navigation", { name: "Admin" }).getByRole("link", { name: /^Enquiries/ }).click();
    await page.getByLabel("Search").fill(reference);
    await page.getByRole("button", { name: "Filter" }).click();
    await page.getByRole("link", { name: "Meera Khan" }).click();
    await expect(page.getByText(email)).toBeVisible();
    await expect(page.getByText("Honeymoon in December, please advise.", { exact: true })).toBeVisible();

    await page.getByLabel("Move to").selectOption("CONTACTED");
    await page.getByLabel("Note (optional)").fill("Called the customer");
    await page.getByRole("button", { name: "Update status" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Status updated." })).toBeVisible();
    await expect(page.getByText("New → Contacted")).toBeVisible();

    await page.getByLabel("New note").fill("Prefers houseboat stay");
    await page.getByRole("button", { name: "Add note" }).click();
    await expect(page.getByText("Prefers houseboat stay")).toBeVisible();

    const [row] = await query<{ status: string }>(`SELECT status FROM enquiry WHERE reference = $1`, [reference]);
    expect(row!.status).toBe("CONTACTED");
  });

  test("a failed notification is recorded and can be retried by staff", async ({ page }) => {
    // Make Gmail (the stub) fail the next two sends: the notification and the acknowledgement.
    await stubControl({ failNext: 2, reset: true });
    const email = uniqueEmail("retry");
    await page.goto("/contact");
    await page.getByLabel("Full name").fill("Imran Lone");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Your message").fill("Family of five, Pahalgam in June.");
    await page.getByRole("checkbox", { name: /privacy notice/ }).check();
    await humanPause(page);
    await page.getByRole("button", { name: "Send message" }).click();
    // The customer still gets their confirmation: the enquiry was saved.
    const reference = (await page.getByTestId("enquiry-reference").textContent())!;

    const [enquiry] = await query<{ id: string }>(`SELECT id FROM enquiry WHERE reference = $1`, [reference]);
    await expect
      .poll(async () => (await query<{ n: number }>(`SELECT count(*)::int AS n FROM email_delivery WHERE "enquiryId" = $1 AND "lastErrorCode" = 'backendError' AND status = 'PENDING'`, [enquiry!.id]))[0]!.n, { timeout: 15_000 })
      .toBe(2);

    await signInAdmin(page);
    await page.goto(`/admin/enquiries/${enquiry!.id}`);
    const internal = page.locator("li", { hasText: "Notification to business inbox" });
    await expect(internal.getByText(/^backendError:/)).toBeVisible();
    await internal.getByRole("button", { name: "Send now" }).click();
    await expect(page.getByRole("status").filter({ hasText: "Queued for another attempt" })).toBeVisible();

    await expect
      .poll(async () => (await query<{ status: string }>(`SELECT status FROM email_delivery WHERE "enquiryId" = $1 AND kind = 'INTERNAL_NOTIFICATION'`, [enquiry!.id]))[0]!.status, { timeout: 15_000 })
      .toBe("SENT");
    // Subjects are RFC 2047-encoded, so match on the addressing instead.
    const delivered = (await stubMessages()).find((m) => m.to === "inbox@example.test" && m.replyTo === email);
    expect(delivered).toMatchObject({ to: "inbox@example.test", replyTo: email });
    await page.reload();
    await expect(internal.getByText("Sent", { exact: true })).toBeVisible();
  });

  test("an administrator edits a package and the change appears on the site", async ({ page }) => {
    await signInAdmin(page);
    await page.goto("/admin/packages");
    await page.getByRole("link", { name: "Kashmir Honeymoon Delight" }).click();
    await page.getByRole("button", { name: "Add included item" }).click();
    await page.getByRole("textbox", { name: "Included item" }).fill("Shikara ride on Dal Lake (e2e)");
    await page.getByRole("button", { name: "Save changes" }).click();
    await expect(page.getByText("Package saved.").first()).toBeVisible();
    await page.goto("/packages/kashmir-honeymoon-delight");
    await expect(page.getByText("Shikara ride on Dal Lake (e2e)")).toBeVisible();
  });

  test("the scheduled worker endpoint accepts the configured secret", async ({ request }) => {
    const response = await request.post("/api/cron/email-outbox", { headers: { authorization: "Bearer e2e-worker-secret-0123456789" } });
    expect(response.status()).toBe(200);
    expect(await response.json()).toMatchObject({ state: "READY" });
  });
});
