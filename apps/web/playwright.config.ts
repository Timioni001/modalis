import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e", workers: 1, fullyParallel: false, timeout: 480_000,
  expect: { timeout: 120_000 },
  use: { baseURL: process.env.MODALIS_E2E_URL ?? "http://localhost:3000", viewport: { width: 390, height: 844 },
    reducedMotion: "reduce", trace: "retain-on-failure", screenshot: "only-on-failure", navigationTimeout: 120_000 },
});
