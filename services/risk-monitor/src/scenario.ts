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

/**
 * A repeatable breach scenario, computed from the portfolio's CURRENT holdings.
 *
 * The fixed `btc_rally` only breaches a portfolio that is still near its targets: once Modalis has
 * rebalanced, the same $70,000 price is absorbed and nothing breaches — which is the system
 * working, but makes for a demo that only runs once. This picks the largest non-liquid holding and
 * reprices it to exactly what it takes to put it `overshootBps` past its binding limit.
 *
 * The chosen price is synthetic and the UI says so, including the size of the implied move. What
 * follows from it — the breach, the proposal, the contract's decision, the settlement — is real.
 *
 * Share after scaling asset k's price by m:  m*v / (T - v + m*v)
 * Solving that for a target share s gives:   m = s*(T - v) / (v*(1 - s))
 */
export function breachLargestHoldingScenario(input: {
  positions: {
    symbol: string;
    token: Address;
    valueE18: bigint;
    priceE18: bigint;
    isLiquid: boolean;
    maxBps: number;
    assetMaxBps: number;
  }[];
  totalValueE18: bigint;
  maxSingleAssetBps: number;
  overshootBps?: number;
}): Scenario {
  const BPS = 10_000n;
  const overshoot = BigInt(input.overshootBps ?? 300);

  const candidates = input.positions.filter((p) => !p.isLiquid && p.valueE18 > 0n);
  if (candidates.length === 0) {
    throw new Error("No non-liquid holding with a balance, so there is nothing to push past a limit.");
  }
  const target = candidates.reduce((a, b) => (b.valueE18 > a.valueE18 ? b : a));

  // The limit that actually binds this holding is the tightest of the three.
  const limitBps = BigInt(
    Math.min(input.maxSingleAssetBps, target.maxBps, target.assetMaxBps),
  );
  const shareBps = limitBps + overshoot;
  if (shareBps >= BPS) {
    throw new Error(`${target.symbol} cannot exceed its limit: it is already allowed up to 100%.`);
  }

  const rest = input.totalValueE18 - target.valueE18;
  if (rest <= 0n) {
    throw new Error("The portfolio holds only one asset, so no single holding can be overweight.");
  }

  // m = s*(T - v) / (v*(1 - s)), in bps-scaled integer arithmetic.
  const numerator = shareBps * rest * BPS;
  const denominator = target.valueE18 * (BPS - shareBps);
  const multiplierBps = numerator / denominator;

  let newPrice = (target.priceE18 * multiplierBps) / BPS;
  // Never *lower* the price in a scenario meant to create an overweight position.
  if (newPrice <= target.priceE18) newPrice = target.priceE18 + target.priceE18 / 10n;

  const movePct = Number((newPrice * 100n) / target.priceE18) - 100;

  return {
    id: "breach_largest",
    title: `A sharp rally in ${target.symbol}`,
    description:
      `Simulated market movement: ${target.symbol} is repriced ${movePct >= 0 ? "+" : ""}${movePct}% ` +
      `(to $${(Number(newPrice) / 1e18).toLocaleString("en-US", { maximumFractionDigits: 2 })}), ` +
      `which is what it takes to push it past the ${(Number(limitBps) / 100).toFixed(0)}% limit in ` +
      `the mandate. The price is synthetic; the resulting breach, proposal, contract validation ` +
      `and settlement are real.`,
    steps: [{ symbol: target.symbol, token: target.token, priceE18: newPrice }],
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

/**
 * One tick of a gentle, bounded market: each price takes a small random step and is pulled back
 * toward where it started, so over a recording the plan drifts off target naturally while no price
 * ever wanders absurdly far. Writing the new price also keeps the oracle fresh.
 *
 * `random` is injectable so the walk is testable; each call must return a number in [0, 1).
 */
export function driftStep(
  current: bigint,
  start: bigint,
  opts: { maxStepBps?: number; maxDeviationBps?: number; random?: () => number } = {},
): bigint {
  const maxStep = opts.maxStepBps ?? 150; // up to ±1.5% a tick
  const maxDev = BigInt(opts.maxDeviationBps ?? 3_000); // never more than ±30% from start
  const random = opts.random ?? Math.random;
  const BPS = 10_000n;

  // Pull toward the start in proportion to how far away we are (a quarter of the gap, in bps of
  // the step budget), then add noise.
  const gapBps = start > 0n ? Number(((start - current) * BPS) / start) : 0;
  const pull = Math.max(-maxStep, Math.min(maxStep, gapBps / 4));
  const noise = (random() * 2 - 1) * maxStep;
  const stepBps = BigInt(Math.round(Math.max(-maxStep, Math.min(maxStep, pull + noise))));

  let next = (current * (BPS + stepBps)) / BPS;
  const lo = (start * (BPS - maxDev)) / BPS;
  const hi = (start * (BPS + maxDev)) / BPS;
  if (next < lo) next = lo;
  if (next > hi) next = hi;
  return next > 0n ? next : 1n;
}

/** Where each demo price starts, matching resetScenario. Cash (mUSD) never moves. */
export const DEMO_START_PRICES_E18: Record<"mBTC" | "mETH" | "mBOND", bigint> = {
  mBTC: 50_000n * 10n ** 18n,
  mETH: 2_500n * 10n ** 18n,
  mBOND: 100n * 10n ** 18n,
};
