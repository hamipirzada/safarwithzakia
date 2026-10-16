import { expect, test, type Page } from "@playwright/test";

const ring = (page: Page) => page.locator("[aria-roledescription=carousel]");
const frontImage = (page: Page) => ring(page).locator("a[tabindex='0'] img");
const caption = (page: Page) => page.locator("[aria-live=polite]").first();

test.describe("homepage 3D hero images", () => {
  test("downloads images large enough for the drawn (cropped) size, front card first", async ({ browser }) => {
    for (const dpr of [1, 2]) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: dpr });
      const page = await context.newPage();
      await page.goto("/");
      await expect(frontImage(page)).toHaveAttribute("data-image-state", "loaded", { timeout: 15_000 });
      const info = await frontImage(page).evaluate((img: HTMLImageElement) => {
        const card = img.closest("a")!.getBoundingClientRect();
        const drawn = Math.max(card.width, card.height * (img.naturalWidth / img.naturalHeight));
        return {
          sizes: img.sizes,
          loading: img.loading,
          priority: img.fetchPriority,
          downloaded: Number(decodeURIComponent(img.currentSrc).match(/[?&]w=(\d+)/)![1]),
          needed: Math.round(drawn * devicePixelRatio),
          filter: getComputedStyle(img).filter,
          opacity: getComputedStyle(img).opacity,
        };
      });
      expect(info.sizes).toBe("(min-width: 1024px) 560px, (min-width: 640px) 500px, 430px");
      expect(info.loading).toBe("eager");
      expect(info.priority).toBe("high");
      expect(info.downloaded, `DPR ${dpr}: downloaded ${info.downloaded}px for ${info.needed}px drawn`).toBeGreaterThanOrEqual(info.needed);
      expect(info.filter).toBe("none"); // never left blurred
      expect(info.opacity).toBe("1"); // never hidden while waiting for JavaScript
      await context.close();
    }
  });

  test("every ring image finishes loading, none twice", async ({ page }) => {
    const counts = new Map<string, number>();
    page.on("request", (r) => r.url().includes("/_next/image") && counts.set(r.url(), (counts.get(r.url()) ?? 0) + 1));
    await page.goto("/");
    const states = ring(page).locator("[data-image-state]");
    await expect.poll(async () => (await states.evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.imageState))).every((s) => s === "loaded"), { timeout: 20_000 }).toBe(true);
    expect([...counts.values()].filter((n) => n > 1)).toEqual([]);
  });

  test("loads promptly on a slow mobile connection with an empty cache", async ({ browser }) => {
    const context = await browser.newContext({ viewport: { width: 412, height: 915 }, deviceScaleFactor: 2.6, isMobile: true, hasTouch: true });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send("Network.enable");
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
    await cdp.send("Network.emulateNetworkConditions", { offline: false, latency: 150, downloadThroughput: (1.6 * 1024 * 1024) / 8, uploadThroughput: (750 * 1024) / 8 });
    const start = Date.now();
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(frontImage(page)).toHaveAttribute("data-image-state", "loaded", { timeout: 15_000 });
    expect(Date.now() - start).toBeLessThan(15_000);
    await context.close();
  });

  test("failed images fall back to a designed card, never a broken image", async ({ page }) => {
    await page.route(/_next\/image\?url=%2Fimages%2Fkashmir%2F(?!dal-lake-dusk)/, (route) => route.abort());
    await page.goto("/");
    const failed = ring(page).locator("[data-image-state=error]");
    await expect(failed.first()).toBeVisible({ timeout: 10_000 });
    expect(await failed.count()).toBeGreaterThan(0);
    expect(await ring(page).locator("[data-image-state=loading]").count()).toBe(0); // nothing stuck
    // Fallbacks keep an accessible name and no <img> remains in a broken state
    await expect(failed.first()).toHaveAttribute("aria-label", /.+/);
    const broken = await ring(page).locator("img").evaluateAll((imgs) => (imgs as HTMLImageElement[]).filter((i) => i.complete && i.naturalWidth === 0).length);
    expect(broken).toBe(0);
  });

  test("auto-advances one card at a time and rests front-facing", async ({ page }) => {
    await page.goto("/");
    await page.mouse.move(5, 5);
    const first = await caption(page).textContent();
    await expect(caption(page)).not.toHaveText(first ?? "", { timeout: 12_000 });
    // At rest the ring transform is an exact multiple of one card step (front card faces the viewer)
    await page.waitForTimeout(900);
    const angle = await ring(page).locator("> div").first().evaluate((el) => Number((el as HTMLElement).style.transform.match(/rotateY\((-?[\d.]+)deg\)/)![1]));
    const count = await ring(page).locator("a").count();
    expect(Math.abs((angle / (360 / count)) % 1)).toBeLessThan(1e-6);
  });

  test("can be dragged with a mouse", async ({ page }) => {
    await page.goto("/");
    const box = (await ring(page).boundingBox())!;
    const before = await caption(page).textContent();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 260, box.y + box.height / 2, { steps: 12 });
    await page.mouse.up();
    await expect(caption(page)).not.toHaveText(before ?? "");
  });

  test("stays still for reduced-motion visitors but remains usable", async ({ browser }) => {
    const context = await browser.newContext({ reducedMotion: "reduce" });
    const page = await context.newPage();
    await page.goto("/");
    await page.mouse.move(5, 5);
    const before = await caption(page).textContent();
    await page.waitForTimeout(6000);
    await expect(caption(page)).toHaveText(before ?? "");
    await page.getByRole("button", { name: "Next destination" }).click();
    await expect(caption(page)).not.toHaveText(before ?? "");
    await context.close();
  });
});
