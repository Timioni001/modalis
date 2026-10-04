/**
 * Scenario engine — DEMO ONLY.
 *
 * Produces a controlled market movement by pushing prices to the MockPriceOracle, so the full
 * loop (breach -> detection -> proposal -> validation -> execution -> settlement) can be
 * demonstrated on demand instead of waiting for the market.
 *
 * Honesty requirements, which the UI must respect:
 *   - The PRICE MOVE is synthetic. The UI labels it "simulated market movement".
 *   - Everything downstream of it is real: a real oracle write, a real breach computed from real
 *     on-chain balances, a real proposal, real contract validation, a real settled transaction.
 *   - This module refuses to run against Monad mainnet.
 */
import { MockPriceOracleAbi, requireContract, type Deployment } from "@modalis/chain";
import type { Address, Hex, PublicClient, WalletClient } from "viem";

export type ScenarioStep = {
  /** Token symbol, for logs and the UI. */
  symbol: string;
  token: Address;
  priceE18: bigint;
};

export type Scenario = {
  id: string;
  title: string;
  /** Shown to the user, and must make clear the move is simulated. */
  description: string;
  steps: ScenarioStep[];
};

export type ScenarioResult = {
  scenario: string;
  writes: { symbol: string; priceE18: bigint; hash: Hex; blockNumber: bigint }[];
};

/**
 * The demo scenario from the brief: mBTC rallies from $50,000 to $70,000, which pushes BTC past
 * the mandate's single-asset cap and drags the liquidity reserve below its floor at the same time.
 */
export function btcRallyScenario(tokens: { mBTC: Address }): Scenario {
  return {
    id: "btc_rally",
    title: "A strong rally in one holding",
    description:
      "Simulated market movement: mBTC is repriced from $50,000 to $70,000. The price move is " +
      "synthetic; the resulting breach, proposal, contract validation and settlement are real.",
    steps: [{ symbol: "mBTC", token: tokens.mBTC, priceE18: 70_000n * 10n ** 18n }],
  };
}

/** Returns prices to their starting values so the demo can be run repeatedly. */
export function resetScenario(tokens: {
  mBTC: Address;
  mETH: Address;
  mBOND: Address;
  mUSD: Address;
}): Scenario {
  return {
    id: "reset",
    title: "Reset demo prices",
    description: "Returns the demo oracle to its starting prices.",
    steps: [
      { symbol: "mBTC", token: tokens.mBTC, priceE18: 50_000n * 10n ** 18n },
      { symbol: "mETH", token: tokens.mETH, priceE18: 2_500n * 10n ** 18n },
      { symbol: "mBOND", token: tokens.mBOND, priceE18: 100n * 10n ** 18n },
      { symbol: "mUSD", token: tokens.mUSD, priceE18: 10n ** 18n },
    ],
  };
}

export async function runScenario(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  scenario: Scenario,
): Promise<ScenarioResult> {
  if (deployment.chainId === 143) {
    throw new Error("The scenario engine must never run against Monad mainnet.");
  }
  const oracle = requireContract(deployment, "priceOracle");
  const account = wallet.account;
  if (!account) throw new Error("Scenario engine needs a wallet with the oracle updater key");

  const writes: ScenarioResult["writes"] = [];
  for (const step of scenario.steps) {
    const hash = await wallet.writeContract({
      address: oracle,
      abi: MockPriceOracleAbi,
      functionName: "setPrice",
      args: [step.token, step.priceE18],
      account,
      chain: wallet.chain,
    });
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") throw new Error(`Oracle write reverted for ${step.symbol} (${hash})`);
    writes.push({ symbol: step.symbol, priceE18: step.priceE18, hash, blockNumber: receipt.blockNumber });
  }
  return { scenario: scenario.id, writes };
}

/**
 * Refreshes every demo price to its current value. The MockPriceOracle has a staleness window and
 * reverts a read once a quote ages past it, which would block execution; the demo needs prices to
 * be fresh, not frozen.
 */
export async function refreshPrices(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  tokens: { symbol: string; token: Address }[],
): Promise<ScenarioResult> {
  const oracle = requireContract(deployment, "priceOracle");
  const steps: ScenarioStep[] = [];
  for (const t of tokens) {
    const quote = (await client.readContract({
      address: oracle,
      abi: MockPriceOracleAbi,
      functionName: "quotes",
      args: [t.token],
    })) as readonly [bigint, bigint];
    steps.push({ symbol: t.symbol, token: t.token, priceE18: quote[0] });
  }
  return runScenario(wallet, client, deployment, {
    id: "refresh",
    title: "Refresh demo prices",
    description: "Re-pushes current prices so the oracle's staleness window does not block reads.",
    steps,
  });
}
