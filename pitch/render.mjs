// Renders pitch/index.html to an MP4, frame by frame.
//
//   node pitch/render.mjs                 # full video -> pitch/modalis-pitch.mp4
//   node pitch/render.mjs --stills 3,15   # PNG stills at those seconds -> pitch/stills/
//
// Every frame is render(t) for an exact t, so the output is identical on every run.
// Resolve Playwright from the project, or from a global install.
const { chromium } = await import("playwright").catch(() => import("/opt/node22/lib/node_modules/playwright/index.mjs"));
import { spawn } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const FPS = 30;
const args = process.argv.slice(2);
const stillsArg = args.includes("--stills") ? args[args.indexOf("--stills") + 1] : null;

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(`file://${join(here, "index.html")}?render`);
await page.evaluate(() => document.fonts.ready);
const duration = await page.evaluate(() => window.DURATION);

if (stillsArg) {
  mkdirSync(join(here, "stills"), { recursive: true });
  for (const s of stillsArg.split(",").map(Number)) {
    await page.evaluate((t) => window.render(t), s);
    await page.screenshot({ path: join(here, "stills", `t${String(s).padStart(5, "0")}.png`) });
  }
  console.log("stills written");
} else {
  const out = join(here, "modalis-pitch.mp4");
  const ff = spawn("ffmpeg", [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(FPS), "-c:v", "mjpeg", "-i", "-",
    "-c:v", "libx264", "-preset", "slow", "-crf", "17", "-pix_fmt", "yuv420p",
    "-movflags", "+faststart", out,
  ], { stdio: ["pipe", "inherit", "inherit"] });
  const total = Math.round(duration * FPS);
  for (let i = 0; i < total; i++) {
    await page.evaluate((t) => window.render(t), i / FPS);
    const frame = await page.screenshot({ type: "jpeg", quality: 96 });
    if (!ff.stdin.write(frame)) await new Promise((r) => ff.stdin.once("drain", r));
    if (i % 300 === 0) console.log(`frame ${i}/${total}`);
  }
  ff.stdin.end();
  await new Promise((r) => ff.on("close", r));
  console.log(`wrote ${out}`);
}
await browser.close();
