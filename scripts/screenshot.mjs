// Dev helper: node scripts/screenshot.mjs <outDir> <baseUrl> <path> [path...]
// Captures full-page screenshots at phone and desktop widths for visual review.
import { chromium } from "@playwright/test";

const [outDir, base, ...paths] = process.argv.slice(2);
const browser = await chromium.launch();
for (const [label, viewport] of [["desktop", { width: 1440, height: 900 }], ["mobile", { width: 390, height: 844 }]]) {
  const page = await browser.newPage({ viewport, reducedMotion: "reduce" });
  for (const path of paths) {
    const response = await page.goto(base + path, { waitUntil: "networkidle" });
    await page.waitForTimeout(400);
    const name = `${label}-${path.replace(/[^a-z0-9]+/gi, "_") || "home"}.png`;
    await page.screenshot({ path: `${outDir}/${name}`, fullPage: true });
    console.log(response?.status(), name);
  }
  await page.close();
}
await browser.close();
