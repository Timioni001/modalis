import type { Address } from "viem";
import { test, expect } from "@playwright/test";
import {
  createMonadPublicClient,
  readTokenBalance,
  readCirclesOf,
  payIntoCircle,
} from "@modalis/chain";
const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const headers = { "x-modalis-dev-wallet": OWNER };

test("consumer plan, funding, withdrawal and permissions work on a real local chain", async ({
  page,
  request,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(baseURL!).hostname,
  );
  const status = await (await request.get("/api/status")).json();
  expect(
    status.developmentLocal,
    "Use scripts/dev-local.sh; never run these writes against a hosted deployment",
  ).toBe(true);
  expect(status.ready).toBe(true);
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const money = async () =>
    (await (await request.get("/api/money", { headers })).json()).money;

  await page.goto("/onboarding");
  await expect(
    page.getByRole("heading", { name: "What are you saving for?" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("#target").fill("2000");
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.locator("#starting").fill("10");
  await page.locator("#contribution").fill("100");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "One question about falls" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Next", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Your limits", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "See my plan", exact: true }).click();
  await page
    .getByRole("button", { name: "Approve this plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your plan is live." }),
  ).toBeVisible();
  const plan = (await (await request.get("/api/plan", { headers })).json())
    .plan;
  expect(plan.goal.target.amount).toBe("2000");

  await page.goto("/app/add-money");
  const faucet = await (
    await request.get("/api/faucet", { headers, maxRetries: 2 })
  ).json();
  if (!faucet.hasTestMoney) {
    await page
      .getByRole("button", { name: "Get test money", exact: true })
      .click();
    await expect
      .poll(
        async () =>
          (
            await (
              await request.get("/api/faucet", { headers, maxRetries: 2 })
            ).json()
          ).hasTestMoney,
      )
      .toBe(true);
  }
  const before = Number((await money()).total.amount);
  await page
    .getByRole("textbox", { name: "Amount to add, in dollars" })
    .fill("50");
  await page
    .getByRole("button", { name: "Work out the steps", exact: true })
    .click();
  await page.getByRole("button", { name: /^Add \$50/ }).click();
  await expect(
    page.getByText("Your money is in your plan", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number((await money()).total.amount))
    .toBeCloseTo(before + 50, 1);

  await page.goto("/app/withdraw");
  await page.locator("#withdraw-amount").fill("5");
  await page
    .getByRole("button", { name: "See what it costs", exact: true })
    .click();
  await page.getByRole("button", { name: /^Take out \$5/ }).click();
  await expect(
    page.getByRole("link", { name: "See my money", exact: true }),
  ).toBeVisible();
  await expect
    .poll(async () => Number((await money()).total.amount))
    .toBeCloseTo(before + 45, 1);

  await page.goto("/app/settings");
  await page
    .getByRole("button", { name: "Pause my plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Resume my plan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Resume my plan", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Pause my plan", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Revoke adjustments", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Allow adjustments", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Allow adjustments", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Revoke adjustments", exact: true }),
  ).toBeVisible();

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    for (const route of [
      "/app",
      "/app/money",
      "/app/plan",
      "/app/activity",
      "/app/circles",
      "/app/scenarios",
      "/app/ask",
    ]) {
      await page.goto(route);
      await expect(page.locator("main")).not.toBeEmpty();
      expect(
        await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        `${route} at ${width}px`,
      ).toBe(true);
    }
  }
  expect(errors).toEqual([]);
});

test("gifting and a savings-circle payment settle into the correct consumer wallets", async ({
  page,
  request,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(baseURL!).hostname,
  );
  const status = await (await request.get("/api/status")).json();
  expect(status.developmentLocal).toBe(true);
  const { createWalletClient, http } = await import("viem");
  const { monadTestnet } = await import("viem/chains");
  const rpcUrl = "http://127.0.0.1:8545";
  const second = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as Address;
  const deployment = {
    chainId: 10143,
    contracts: status.technical.contracts,
    tokens: status.technical.tokens,
  };
  const client = createMonadPublicClient({
    chainId: 10143,
    httpUrl: rpcUrl,
    multicall: false,
  });
  const token = status.technical.tokens.mUSD as Address;
  const beforeGift = await readTokenBalance(client, token, second);
  await page.goto("/app/payments");
  await expect(page.locator("#payment-amount")).toBeVisible();
  await page.locator("#payment-amount").fill("10.123456");
  await page.locator("#payment-purpose").fill("Birthday");
  await page.locator("#payment-recipient").fill(second);
  await page
    .getByRole("button", { name: "Review a payment", exact: true })
    .click();
  await expect(page.locator("#gift")).toHaveValue("10.123456");
  await page
    .getByRole("button", { name: "Send $10.123456", exact: true })
    .click();
  await expect(page.getByText("Gift sent", { exact: true })).toBeVisible();
  expect(await readTokenBalance(client, token, second)).toBe(
    beforeGift + 10_123_456n,
  );

  const name = `Consumer test ${Date.now()}`;
  await page.goto("/app/circles");
  await page.locator("#circle-name").fill(name);
  await page.locator("#circle-amount").fill("1");
  await page.locator("#circle-members").fill(second);
  await page.locator("#circle-round").selectOption("300");
  await page
    .getByRole("button", { name: "Start the circle", exact: true })
    .click();
  const card = page
    .locator("section")
    .filter({ has: page.getByRole("heading", { name, exact: true }) });
  await expect(card).toBeVisible();
  const beforePayment = await readTokenBalance(client, token, OWNER);
  await card.getByRole("button", { name: "Pay my $1", exact: true }).click();
  await expect
    .poll(async () => {
      const circle = (await readCirclesOf(client, deployment, OWNER)).find(
        (item) => item.name === name,
      );
      return circle?.paidCount;
    })
    .toBe(1);
  expect(await readTokenBalance(client, token, OWNER)).toBe(
    beforePayment - 1_000_000n,
  );
  const circle = (await readCirclesOf(client, deployment, second)).find(
    (item) => item.name === name,
  )!;
  const wallet = createWalletClient({
    account: second,
    chain: monadTestnet,
    transport: http(rpcUrl),
  });
  const hash = await payIntoCircle(wallet, client, deployment, circle);
  expect((await client.waitForTransactionReceipt({ hash })).status).toBe(
    "success",
  );
  // The first recipient receives both contributions, not a payment to a Modalis account.
  expect(await readTokenBalance(client, token, OWNER)).toBe(
    beforePayment + 1_000_000n,
  );
});
