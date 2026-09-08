import { chromium } from "@playwright/test";
import { mkdir } from "node:fs/promises";
const browser = await chromium.launch({ channel: "chrome", headless: true });
try {
  await mkdir("docs/previews", { recursive: true });
  for (const [name, width, height] of [["desktop", 1440, 1100], ["mobile", 390, 844]]) {
    const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1 });
    await page.goto(`${process.env.PREVIEW_ORIGIN || "http://localhost:3000"}/apply`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `docs/previews/${name}.png`, fullPage: true });
    await page.close();
  }
} finally { await browser.close(); }
