import { test, expect } from "@playwright/test";
import { createPublicClient, http, type Address } from "viem";
import { MockPriceOracleAbi } from "@modalis/chain";

test("expired demo prices recover from the browser without changing quote values", async ({
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
    "Never advance time or sign scenario writes against a hosted chain",
  ).toBe(true);
  expect(status.demoMode).toBe(true);
  const client = createPublicClient({
    transport: http("http://127.0.0.1:8545"),
  });
  const oracle = status.technical.contracts.priceOracle as Address;
  const tokens = Object.values(status.technical.tokens) as Address[];
  const readQuotes = () =>
    Promise.all(
      tokens.map((token) =>
        client.readContract({
          address: oracle,
          abi: MockPriceOracleAbi,
          functionName: "quotes",
          args: [token],
        }),
      ),
    );
  const before = await readQuotes();
  for (const [method, params] of [
    ["evm_increaseTime", [86401]],
    ["evm_mine", []],
  ] as const) {
    const result = await request.post("http://127.0.0.1:8545", {
      data: { jsonrpc: "2.0", id: 1, method, params },
    });
    expect((await result.json()).error).toBeUndefined();
  }
  expect((await (await request.get("/api/status")).json()).prices.ready).toBe(
    false,
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/app/plan");
  await page
    .getByRole("button", { name: "Refresh demo prices", exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await (await request.get("/api/status")).json()).prices.ready,
    )
    .toBe(true);
  await expect(
    page.getByRole("button", { name: "Refresh demo prices", exact: true }),
  ).toHaveCount(0);
  const after = await readQuotes();
  for (let i = 0; i < tokens.length; i++) {
    expect(after[i][0]).toBe(before[i][0]);
    expect(after[i][1]).toBeGreaterThan(before[i][1]);
  }
  expect(errors).toEqual([]);
});
