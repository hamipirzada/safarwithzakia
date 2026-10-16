import { expect, type Page } from "@playwright/test";
import pg from "pg";
import { E2E_DATABASE_URL } from "../../playwright.config";

export const STUB = "http://127.0.0.1:3199";

export async function query<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T[]> {
  const client = new pg.Client({ connectionString: E2E_DATABASE_URL });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows as T[];
  } finally {
    await client.end();
  }
}

export async function stubControl(body: Record<string, unknown>) {
  await fetch(`${STUB}/__control`, { method: "POST", body: JSON.stringify(body) });
}

export async function stubMessages(): Promise<{ to: string; subject: string; replyTo: string | null }[]> {
  return (await fetch(`${STUB}/__messages`)).json();
}

export async function login(page: Page, email = "admin@e2e.test", password = "e2e-admin-password-1") {
  await page.goto("/admin/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

/** The public forms reject submissions made faster than a person could type. */
export async function humanPause(page: Page) {
  await page.waitForTimeout(2700);
}

export const uniqueEmail = (tag: string) => `${tag}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`;

// Signed-in admin cookies, reused across tests: the production login throttle (10 sign-ins per
// 15 minutes per IP) is deliberately left in force, so tests must not sign in for every test.
const savedAdminState = new Map<string, Awaited<ReturnType<import("@playwright/test").BrowserContext["storageState"]>>>();

/**
 * A signed-in page in its own browser context (separate from the public visitor).
 * `fresh: true` always performs a real sign-in (needed when a test revokes sessions).
 */
export async function adminSession(
  browser: import("@playwright/test").Browser,
  email = "admin@e2e.test",
  password = "e2e-admin-password-1",
  { fresh = false }: { fresh?: boolean } = {},
) {
  const cached = fresh ? undefined : savedAdminState.get(email);
  const context = await browser.newContext(cached ? { storageState: cached } : {});
  const page = await context.newPage();
  if (cached) {
    await page.goto("/admin");
    if (/\/admin\/login/.test(page.url())) {
      savedAdminState.delete(email);
      await login(page, email, password);
    }
  } else {
    await login(page, email, password);
  }
  if (!fresh) savedAdminState.set(email, await context.storageState());
  return { context, page };
}

/** A fresh visitor context with no admin cookies. */
export async function visitor(browser: import("@playwright/test").Browser) {
  const context = await browser.newContext();
  return { context, page: await context.newPage() };
}

/** Wait for an admin form's server confirmation (role=status) containing the text. */
export async function expectSaved(page: Page, text: string | RegExp) {
  await expect(page.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}

export const suffix = () => `${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export function futureDate(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

/** Section of an admin editor by its heading (editor sections are <section> with an h2). */
export function editorSection(page: Page, heading: string) {
  return page.locator("section").filter({ has: page.getByRole("heading", { level: 2, name: heading, exact: true }) });
}

/**
 * Click a submit button of an admin form, wait for the server action's response, then require
 * the confirmation inside that same form. Never satisfied by an older message.
 */
export async function clickAndConfirm(page: Page, button: import("@playwright/test").Locator, text: string | RegExp) {
  // Tag the form itself (the clicked button may be replaced after the save, e.g. Publish → Unpublish);
  // also follow the button in case the form's inputs were remounted with the saved version.
  const mark = `submit-${Math.random().toString(36).slice(2)}`;
  await button.evaluate((el, value) => (el as HTMLButtonElement).form?.setAttribute("data-test-submit", value), mark);
  const form = page.locator(`form[data-test-submit="${mark}"]`).or(button.locator("xpath=ancestor::form[1]"));
  const response = page.waitForResponse((r) => r.request().method() === "POST" && r.request().headers()["next-action"] !== undefined);
  await button.click();
  expect((await response).status()).toBe(200);
  await expect(form.getByRole("status").filter({ hasText: text }).first()).toBeVisible();
}

/** Sign the default page in as the e2e admin, reusing the cached session when there is one. */
export async function signInAdmin(page: Page) {
  const cached = savedAdminState.get("admin@e2e.test");
  if (cached) {
    await page.context().addCookies(cached.cookies);
    await page.goto("/admin");
    if (!/\/admin\/login/.test(page.url())) return;
  }
  await login(page);
  savedAdminState.set("admin@e2e.test", await page.context().storageState());
}
