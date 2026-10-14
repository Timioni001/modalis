/**
 * Modalis Twin: deterministic, read-only projections for alternative futures.
 *
 * This module deliberately has no chain, database, clock, or AI dependency. A Twin is a
 * sandbox: exploring it cannot move funds. The three return paths are fixed educational
 * assumptions, not a market forecast. Every value is calculated with integer 1e18 arithmetic so
 * the API never has to route money through a JavaScript Number.
 */
import { moneyFromE18, type Money } from "./models.ts";

const E18 = 10n ** 18n;
const BPS = 10_000n;
const MONTHS_PER_YEAR = 12n;
export const TWIN_MAX_MONTHS = 600;

export type TwinRisk = "cautious" | "balanced" | "adventurous";

export type TwinScenarioInput = {
  /** Current value in the portfolio, in USD 1e18. */
  startingE18: bigint;
  targetE18: bigint;
  monthsRemaining: number;
  monthlyContributionE18: bigint;
  /** A planned withdrawal made before contributions start. */
  withdrawalE18: bigint;
  risk: TwinRisk;
};

export type TwinRiskProfile = {
  label: string;
  expectedAnnualReturnBps: number;
  downsideAnnualReturnBps: number;
  upsideAnnualReturnBps: number;
  maxDrawdownBps: number;
  minLiquidityBps: number;
  maxSingleAssetBps: number;
  rebalanceThresholdBps: number;
};

export const TWIN_RISK_PROFILES: Record<TwinRisk, TwinRiskProfile> = {
  cautious: {
    label: "Cautious",
    expectedAnnualReturnBps: 200,
    downsideAnnualReturnBps: -800,
    upsideAnnualReturnBps: 500,
    maxDrawdownBps: 800,
    minLiquidityBps: 5_000,
    maxSingleAssetBps: 2_000,
    rebalanceThresholdBps: 400,
  },
  balanced: {
    label: "Balanced",
    expectedAnnualReturnBps: 500,
    downsideAnnualReturnBps: -1_500,
    upsideAnnualReturnBps: 1_000,
    maxDrawdownBps: 1_500,
    minLiquidityBps: 3_000,
    maxSingleAssetBps: 3_000,
    rebalanceThresholdBps: 500,
  },
  adventurous: {
    label: "Adventurous",
    expectedAnnualReturnBps: 800,
    downsideAnnualReturnBps: -2_500,
    upsideAnnualReturnBps: 1_600,
    maxDrawdownBps: 2_500,
    minLiquidityBps: 1_500,
    maxSingleAssetBps: 4_000,
    rebalanceThresholdBps: 700,
  },
};

export type TwinOutcome = {
  input: TwinScenarioInput;
  expectedE18: bigint;
  downsideE18: bigint;
  upsideE18: bigint;
  expected: Money;
  downside: Money;
  upside: Money;
  expectedShortfallE18: bigint;
  downsideShortfallE18: bigint;
  expectedShortfall: Money;
  downsideShortfall: Money;
  requiredMonthlyE18: bigint;
  requiredMonthly: Money;
  /** Weighted share of the three fixed paths that meet the goal (0–100). */
  confidencePct: number;
  reachesOnExpectedPath: boolean;
  assumptions: string[];
};

export type TwinComparison = {
  base: TwinOutcome;
  alternative: TwinOutcome;
  expectedDeltaE18: bigint;
  downsideDeltaE18: bigint;
  requiredMonthlyDeltaE18: bigint;
  expectedDelta: Money;
  downsideDelta: Money;
  requiredMonthlyDelta: Money;
};

/** Rejects an invalid sandbox input before it can reach persistence or a contract call. */
export function validateTwinInput(input: TwinScenarioInput): void {
  if (input.startingE18 < 0n) throw new Error("Your current balance cannot be negative.");
  if (input.targetE18 <= 0n) throw new Error("Choose a target greater than zero.");
  if (!Number.isInteger(input.monthsRemaining) || input.monthsRemaining < 1 || input.monthsRemaining > TWIN_MAX_MONTHS) {
    throw new Error(`Choose a timeline between 1 and ${TWIN_MAX_MONTHS} months.`);
  }
  if (input.monthlyContributionE18 < 0n) throw new Error("Your monthly contribution cannot be negative.");
  if (input.withdrawalE18 < 0n) throw new Error("A withdrawal cannot be negative.");
  if (input.withdrawalE18 > input.startingE18) throw new Error("That withdrawal is larger than your current balance.");
  if (!Object.prototype.hasOwnProperty.call(TWIN_RISK_PROFILES, input.risk)) {
    throw new Error("Choose a supported risk preference.");
  }
}

function ceilDiv(a: bigint, b: bigint): bigint {
  if (a <= 0n) return 0n;
  return (a + b - 1n) / b;
}

/** Fixed monthly compounding with truncation toward zero, plus the month's contribution. */
function projectPath(input: TwinScenarioInput, annualReturnBps: number): bigint {
  let value = input.startingE18 - input.withdrawalE18;
  const monthlyRate = BigInt(annualReturnBps) * E18 / (BPS * MONTHS_PER_YEAR);
  const factor = E18 + monthlyRate;
  // The fixed profiles stay above -100%; this guard keeps the function safe if a profile changes.
  if (factor <= 0n) throw new Error("The selected return assumption is invalid.");
  for (let month = 0; month < input.monthsRemaining; month += 1) {
    value = (value * factor) / E18;
    value += input.monthlyContributionE18;
  }
  return value;
}

function shortfall(target: bigint, value: bigint): bigint {
  return value >= target ? 0n : target - value;
}

export function simulateTwin(input: TwinScenarioInput): TwinOutcome {
  validateTwinInput(input);
  const profile = TWIN_RISK_PROFILES[input.risk];
  const expectedE18 = projectPath(input, profile.expectedAnnualReturnBps);
  const downsideE18 = projectPath(input, profile.downsideAnnualReturnBps);
  const upsideE18 = projectPath(input, profile.upsideAnnualReturnBps);
  const target = input.targetE18;
  const expectedShortfallE18 = shortfall(target, expectedE18);
  const downsideShortfallE18 = shortfall(target, downsideE18);
  const startingAfterWithdrawal = input.startingE18 - input.withdrawalE18;
  const requiredMonthlyE18 = ceilDiv(shortfall(target, startingAfterWithdrawal), BigInt(input.monthsRemaining));

  // These are scenario weights, not a statistical probability or a promise of returns. Naming
  // this confidence keeps the product honest while still helping someone compare two futures.
  const confidencePct =
    (downsideE18 >= target ? 25 : 0) +
    (expectedE18 >= target ? 50 : 0) +
    (upsideE18 >= target ? 25 : 0);

  return {
    input,
    expectedE18,
    downsideE18,
    upsideE18,
    expected: moneyFromE18(expectedE18),
    downside: moneyFromE18(downsideE18),
    upside: moneyFromE18(upsideE18),
    expectedShortfallE18,
    downsideShortfallE18,
    expectedShortfall: moneyFromE18(expectedShortfallE18),
    downsideShortfall: moneyFromE18(downsideShortfallE18),
    requiredMonthlyE18,
    requiredMonthly: moneyFromE18(requiredMonthlyE18),
    confidencePct,
    reachesOnExpectedPath: expectedE18 >= target,
    assumptions: [
      "Starting value is the live portfolio balance at the time this calculation ran.",
      "Contributions are added monthly after the fixed monthly return assumption.",
      `The ${profile.label.toLowerCase()} profile uses fixed annual paths of ${profile.downsideAnnualReturnBps / 100}% downside, ${profile.expectedAnnualReturnBps / 100}% expected, and ${profile.upsideAnnualReturnBps / 100}% upside.`,
      "Confidence is a 25% / 50% / 25% weighting of those three paths, not a market forecast.",
      "Fees, taxes, trading costs, deposits, and withdrawals other than the one entered are excluded.",
    ],
  };
}

export function compareTwins(base: TwinScenarioInput, alternative: TwinScenarioInput): TwinComparison {
  const baseOutcome = simulateTwin(base);
  const alternativeOutcome = simulateTwin(alternative);
  return {
    base: baseOutcome,
    alternative: alternativeOutcome,
    expectedDeltaE18: alternativeOutcome.expectedE18 - baseOutcome.expectedE18,
    downsideDeltaE18: alternativeOutcome.downsideE18 - baseOutcome.downsideE18,
    requiredMonthlyDeltaE18: alternativeOutcome.requiredMonthlyE18 - baseOutcome.requiredMonthlyE18,
    expectedDelta: moneyFromE18(alternativeOutcome.expectedE18 - baseOutcome.expectedE18),
    downsideDelta: moneyFromE18(alternativeOutcome.downsideE18 - baseOutcome.downsideE18),
    requiredMonthlyDelta: moneyFromE18(alternativeOutcome.requiredMonthlyE18 - baseOutcome.requiredMonthlyE18),
  };
}

export const twinAssumption =
  "Twin is a read-only comparison. It uses deterministic fixed return paths to make trade-offs visible; it does not predict markets or move your money.";
