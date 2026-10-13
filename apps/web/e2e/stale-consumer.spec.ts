import { test, expect } from "@playwright/test";
import { createPublicClient, http, type Address } from "viem";
import { PortfolioVaultAbi } from "@modalis/chain";
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as Address;
const headers = { "x-modalis-dev-wallet": OWNER };
test("expired prices and unavailable recovery do not block consumer saving, retrieval, goals or manual calculations", async ({
  page,
  request,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(baseURL!).hostname,
  );
  const status = await (await request.get("/api/status?fresh=1")).json();
  expect(status.developmentLocal).toBe(true);
  test.skip(
    status.prices.ready || status.prices.recovery.canRefresh,
    "Use an expired local oracle without a matching server signer.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  expect(status.readiness).toBe("limited");
  expect(status.features.directSaving).toBe(true);
  expect((await request.get("/api/cron/prices")).status()).toBe(401);
  expect((await request.post("/api/demo/prices", { data: {} })).status()).toBe(
    401,
  );
  expect(
    (await request.post("/api/demo/prices", { headers, data: {} })).status(),
  ).toBe(503);
  const preferences = {
    minimumContribution: "10.25",
    minimumRetrievalDays: 30,
    customDetails: "Local stale-quote test",
  };
  expect(
    (
      await request.patch("/api/plan/savings", { headers, data: preferences })
    ).ok(),
  ).toBe(true);
  const plan = (await (await request.get("/api/plan", { headers })).json())
    .plan;
  expect(plan.goal.savings.minimumContribution).toBe("10.25");
  expect(
    (
      await request.post("/api/money/direct-saving", {
        headers,
        data: { amount: "10.24" },
      })
    ).status(),
  ).toBe(422);
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });
  const balance = () =>
    client.readContract({
      address: status.technical.contracts.portfolioVault,
      abi: PortfolioVaultAbi,
      functionName: "balanceOf",
      args: [OWNER, status.technical.tokens.mUSD],
    });
  const before = await balance();
  await page.goto("/app/add-money");
  await page.locator("#direct-save-amount").fill("12.34");
  await page
    .getByRole("button", { name: "Review saving", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Save 12.34 mUSD", exact: true })
    .click();
  await expect(
    page.getByText("Your demo dollars are saved", { exact: true }),
  ).toBeVisible();
  expect(await balance()).toBe(before + 12_340_000n);
  await page.goto("/app/withdraw");
  await page.locator("#direct-retrieve-amount").fill("2.34");
  await page
    .getByRole("button", { name: "Review retrieval", exact: true })
    .click();
  await expect(page.getByText(/You can withdraw early/)).toBeVisible();
  await page
    .getByRole("button", { name: "Retrieve 2.34 mUSD", exact: true })
    .click();
  await expect(
    page.getByText("Your demo dollars were retrieved", { exact: true }),
  ).toBeVisible();
  expect(await balance()).toBe(before + 10_000_000n);
  await page.goto("/app/goals");
  await expect(
    page.getByText("Saved goals, ready to manage", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("We couldn't load your plan", { exact: true }),
  ).toHaveCount(0);
  await page.goto("/app/scenarios");
  await page.locator("#scenario-base").fill("100");
  await page
    .getByRole("button", { name: /put in .*today/i })
    .first()
    .click();
  await expect(page.getByText("The answer", { exact: true })).toBeVisible();
  await expect(page.getByText(/not a live balance/)).toBeVisible();
  expect(
    (await (await request.get("/api/status?fresh=1")).json()).prices.ready,
  ).toBe(false);
  expect(errors).toEqual([]);
});

test("mobile content scrolls clear of the header and dock across narrow and landscape viewports", async ({
  page,
}) => {
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/app/payments");
    await expect(page.locator("#payment-amount")).toBeVisible();
    const frame = await page.evaluate(() => {
      const main = document.getElementById("main")!;
      const header = document.querySelector('[data-testid="app-header"]')!;
      return {
        overflow: document.documentElement.scrollWidth > innerWidth,
        documentScroll: document.documentElement.scrollHeight > innerHeight + 1,
        headerBottom: header.getBoundingClientRect().bottom,
        mainTop: main.getBoundingClientRect().top,
        mainBottom: main.getBoundingClientRect().bottom,
        height: innerHeight,
      };
    });
    expect(frame.overflow).toBe(false);
    expect(frame.documentScroll).toBe(false);
    expect(frame.mainTop).toBeGreaterThanOrEqual(frame.headerBottom - 1);
    expect(frame.mainBottom).toBeLessThanOrEqual(frame.height - 87);
    await page
      .locator("main")
      .evaluate((main) => main.scrollTo(0, main.scrollHeight));
    expect(await page.evaluate(() => window.scrollY)).toBe(0);
  }
});
