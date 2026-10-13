import { test, expect } from "@playwright/test";

const OWNER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const OTHER = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8";
const headers = { "x-modalis-dev-wallet": OWNER };

test("custom contribution and retrieval settings save, reload and work on a narrow phone", async ({
  page,
  request,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1", "[::1]"]).toContain(
    new URL(baseURL!).hostname,
  );
  const status = await (await request.get("/api/status")).json();
  expect(status.developmentLocal).toBe(true);
  test.skip(
    !status.poweredBy?.savedData,
    "Run with the local integration database configured; never use a hosted service.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto("/onboarding");
  for (let i = 0; i < 4; i++)
    await page.getByRole("button", { name: "Next", exact: true }).click();
  await page.getByText("Custom savings details", { exact: true }).click();
  await page
    .getByLabel("Minimum per contribution ($)", { exact: true })
    .fill("200.01");
  await expect(
    page.getByRole("button", { name: "See my plan", exact: true }),
  ).toBeDisabled();
  await page
    .getByLabel("Minimum per contribution ($)", { exact: true })
    .fill("10.25");
  await page.getByLabel("Wait before retrieving (days)").fill("-1");
  await expect(
    page.getByRole("button", { name: "See my plan", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Wait before retrieving (days)").fill("30");
  const notes =
    "For tuition. <script>throw new Error('never execute notes')</script>";
  await page.getByLabel("Anything else about your savings?").fill(notes);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "See my plan", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Your savings preferences",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("$10.25", { exact: true })).toBeVisible();
  await expect(page.getByText(notes, { exact: true })).toBeVisible();
  await page
    .getByRole("button", { name: "Approve this plan", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Your plan is live." }),
  ).toBeVisible();

  const saved = (await (await request.get("/api/plan", { headers })).json())
    .plan.goal.savings;
  expect(saved.minimumContribution).toBe("10.25");
  expect(saved.minimumRetrievalDays).toBe(30);
  expect(saved.customDetails).toBe(notes);
  expect(saved.startedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

  await page.goto("/app/plan");
  await expect(page.getByText("$10.25", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Edit savings preferences" }).click();
  await page.getByText("Custom savings details", { exact: true }).click();
  await page
    .getByLabel("Minimum per contribution ($)", { exact: true })
    .fill("10.10");
  await page
    .getByRole("button", { name: "Save preferences", exact: true })
    .click();
  await expect(
    page.getByText("Your savings preferences are saved.", { exact: true }),
  ).toBeVisible();
  await page.reload();
  await expect(page.getByText("$10.10", { exact: true })).toBeVisible();
  const updated = (await (await request.get("/api/plan", { headers })).json())
    .plan.goal.savings;
  expect(updated.startedAt).toBe(saved.startedAt);

  await page.goto("/app/add-money");
  await page
    .getByRole("textbox", { name: "Amount to add, in dollars" })
    .fill("10.09");
  await expect(
    page.getByRole("button", { name: "Work out the steps", exact: true }),
  ).toBeDisabled();
  const refused = await request.post("/api/money/funding-plan", {
    headers,
    data: { amount: "10.09" },
  });
  expect(refused.status()).toBe(422);
  expect(
    (
      await request.post("/api/money/funding-plan", {
        headers,
        data: { amount: "10.10" },
      })
    ).ok(),
  ).toBe(true);

  await page.goto("/app/withdraw");
  await page.locator("#withdraw-amount").fill("1");
  await page
    .getByRole("button", { name: "See what it costs", exact: true })
    .click();
  await expect(
    page.getByText(/This is a personal reminder; you can still withdraw early/),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /^Take out \$1/ }),
  ).toBeEnabled();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);

  const bad = await request.patch("/api/plan/savings", {
    headers,
    data: { minimumContribution: "0.001", minimumRetrievalDays: 30 },
  });
  expect(bad.status()).toBe(400);
  const foreign = await request.patch("/api/plan/savings", {
    headers: { "x-modalis-dev-wallet": OTHER },
    data: {
      minimumContribution: "0.00",
      minimumRetrievalDays: 0,
      goalId: (await (await request.get("/api/plan", { headers })).json()).plan
        .goal.id,
    },
  });
  expect(foreign.status()).toBe(409);
  expect(
    (await (await request.get("/api/plan", { headers })).json()).plan.goal
      .savings.minimumContribution,
  ).toBe("10.10");
  expect(errors).toEqual([]);
});
