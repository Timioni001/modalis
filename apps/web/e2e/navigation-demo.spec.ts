import { test, expect } from "@playwright/test";

test("demo works without signing, keyboard tabs update sample projections", async ({
  page,
}) => {
  const writes: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/") && request.method() !== "GET")
      writes.push(request.url());
  });
  await page.goto("/demo");
  await expect(
    page.getByRole("heading", { name: /A clear plan/ }),
  ).toBeVisible();
  await page.locator("#demo-monthly").fill("50");
  await expect(
    page.getByText("$1,100 from contributions", { exact: true }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Your goal" }).focus();
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Payments", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await expect(
    page.getByRole("heading", { name: "Send. Request. Save together." }),
  ).toBeVisible();
  await page.keyboard.press("End");
  await expect(
    page.getByRole("heading", { name: "You set the boundaries" }),
  ).toBeVisible();
  await page.getByText("Custom savings details", { exact: true }).click();
  await page
    .getByLabel("Minimum per contribution ($)", { exact: true })
    .fill("5.50");
  await page.getByLabel("Wait before retrieving (days)").fill("45");
  await page
    .getByLabel("Anything else about your savings?")
    .fill("Keep this for the trip.");
  await expect(page.getByText("$5.50", { exact: true })).toBeVisible();
  await expect(
    page.getByText("45 days after approval", { exact: true }),
  ).toBeVisible();
  await page.getByLabel("Wait before retrieving (days)").fill("3651");
  await expect(
    page.getByText("Enter a waiting period from 0 to 3,650 whole days.", {
      exact: true,
    }),
  ).toBeVisible();
  await page.getByLabel("Wait before retrieving (days)").fill("45");
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  expect(writes).toEqual([]);
});

test("mobile header and dock collapse, trap focus and clear the legal links", async ({
  page,
  request,
}) => {
  const status = await (await request.get("/api/status")).json();
  await page.goto("/app/payments");
  for (const width of [320, 360, 390, 768]) {
    await page.setViewportSize({ width, height: 844 });
    const header = page.getByTestId("app-header");
    await expect(
      header.getByRole("button", { name: "Menu", exact: true }),
    ).toBeVisible();
    await header.getByRole("button", { name: "Menu", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Menu", exact: true });
    await expect(dialog).toBeVisible();
    if (!status.poweredBy?.savedData)
      await expect(
        dialog.getByRole("link", { name: "Goals", exact: true }),
      ).toHaveCount(0);
    await page.keyboard.press("Tab");
    expect(
      await dialog.evaluate((el) => el.contains(document.activeElement)),
    ).toBe(true);
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    await expect(
      header.getByRole("button", { name: "Menu", exact: true }),
    ).toBeFocused();
    await header.getByRole("button", { name: "Menu", exact: true }).click();
    await page.mouse.click(1, 600);
    await expect(dialog).not.toBeVisible();
    const dock = page.getByTestId("app-dock");
    await expect(dock.getByRole("button")).toHaveCount(1);
    await dock.getByRole("button").click();
    const pages = page.getByRole("dialog", { name: "Go to", exact: true });
    await expect(pages).toBeVisible();
    await pages.getByRole("link", { name: "Payments", exact: true }).click();
    await expect(pages).not.toBeVisible();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page
      .locator("main")
      .evaluate((el) => el.scrollTo(0, el.scrollHeight));
    const legal = await page
      .getByRole("navigation", { name: "Legal", exact: true })
      .boundingBox();
    const floating = await dock.boundingBox();
    const content = await page.locator("main").boundingBox();
    expect(content!.y + content!.height).toBeLessThanOrEqual(floating!.y);
    expect(legal!.y + legal!.height).toBeLessThanOrEqual(floating!.y);
    const headerControls = await header.locator("a,button").evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        return { left: r.left, right: r.right };
      }),
    );
    expect(headerControls[0].right).toBeLessThanOrEqual(headerControls[1].left);
  }
  await page.getByTestId("app-dock").getByRole("button").click();
  await page
    .getByRole("dialog", { name: "Go to" })
    .getByRole("link", { name: "Activity", exact: true })
    .click();
  await expect(page).toHaveURL(/\/app\/activity$/);
  await expect(page.getByRole("dialog")).not.toBeVisible();
});

test("payment requests validate recipients, encode details and share the exact request", async ({
  page,
  request,
  context,
  baseURL,
}) => {
  expect(["localhost", "127.0.0.1"]).toContain(new URL(baseURL!).hostname);
  expect(
    (await (await request.get("/api/status")).json()).developmentLocal,
  ).toBe(true);
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/app/payments");
  await page.locator("#payment-amount").fill("12.50");
  await page.locator("#payment-purpose").fill("Lunch & school #1");
  await page
    .getByRole("button", { name: "Create a request link", exact: true })
    .click();
  const link = await page.locator("#request-link").inputValue();
  const query = new URL(link).searchParams;
  expect(query.get("amount")).toBe("12.50");
  expect(query.get("for")).toBe("Lunch & school #1");
  expect(query.get("chain")).toBe("10143");
  await page
    .getByRole("button", { name: "Share or copy request", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Request link copied." }),
  ).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);
  await page.locator("#payment-recipient").fill("invalid");
  await page
    .getByRole("button", { name: "Review a payment", exact: true })
    .click();
  await expect(
    page.getByText("Enter a valid recipient wallet address."),
  ).toBeVisible();
  await page.goto(
    "/app/gift/0x70997970C51812dc3A010C7d01b50e0d17dc79C8?amount=12.50&chain=143&asset=mUSD",
  );
  await expect(page.getByText(/unsupported network or asset/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send \$/ })).toHaveCount(0);
});
