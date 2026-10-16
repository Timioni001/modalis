// Exports every artboard in social/studio.html as a PNG in social/out/.
//
//   node social/export.mjs
//
// Each asset is written at its X size and at 2x, so it stays sharp on high-density screens.
const { chromium } = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, "out");
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
for (const scale of [1, 2]) {
  const page = await browser.newPage({ viewport: { width: 1700, height: 1000 }, deviceScaleFactor: scale });
  await page.goto(`file://${join(here, "studio.html")}`);
  await page.evaluate(() => document.fonts.ready);
  for (const id of await page.$$eval(".board", (els) => els.map((e) => e.id))) {
    const suffix = scale === 1 ? "" : "@2x";
    await page.locator(`#${id}`).screenshot({ path: join(out, `${id}${suffix}.png`) });
  }
  await page.close();
}
await browser.close();
console.log(`wrote ${out}`);
