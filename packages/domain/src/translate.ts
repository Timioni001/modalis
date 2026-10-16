/**
 * Protocol -> product translation.
 *
 * This is the only file that reads protocol shapes and writes domain shapes. Everything above it
 * speaks Goal / Plan / Money / Progress / Adjustment / Activity; everything below it speaks
 * mandates, basis points and uint256.
 *
 * Keeping that boundary in one file is the point: if a UI ever has to know what a mandate is, the
 * leak started here.
 */
import { ASSETS } from "./assets.ts";
import type { OnchainMandate, PortfolioState, PlanState, OnchainPosition } from "@modalis/chain";
import type { RiskAssessment, Violation } from "@modalis/portfolio";
import type { MandateDraft, RiskProfile } from "@modalis/ai";
import {
  moneyFromE18,
  moneyInSentence,
  money,
  percentFromBps,
  type Goal,
  type Holding,
  type MoneyView,
  type Plan,
  type PlanHolding,
  type PlanIssue,
  type PlanRules,
  type Progress,
  type ProgressStatus,
  type RiskLevel,
  type RiskLevelName,
  type Receipt,
} from "./models.ts";

/**
 * A person reads "Cash" and "Bitcoin", not "mUSD" and "mBTC". Names come from the asset registry;
 * an unknown code falls back to the code itself rather than an invented name.
 */
export const displayName = (code: string): string => ASSETS[code]?.name ?? code;

// ------------------------------------------------------------------ risk level

/** 0-100 risk score -> the three levels a person chooses between. */
export function riskLevelName(score: number): RiskLevelName {
  if (score < 35) return "cautious";
  if (score < 65) return "balanced";
  return "adventurous";
}

export function toRiskLevel(profile: RiskProfile): RiskLevel {
  return {
    level: riskLevelName(profile.riskScore),
    score: profile.riskScore,
    reasons: profile.rationale,
  };
}

// ------------------------------------------------------------------ plan rules

export function rulesFromMandate(m: {
  maxSingleAssetBps: number;
  minLiquidityBps: number;
  maxDrawdownBps: number;
  rebalanceThresholdBps: number;
}): PlanRules {
  return {
    maxInOneInvestmentPercent: percentFromBps(m.maxSingleAssetBps, 0),
    moneyKeptAvailablePercent: percentFromBps(m.minLiquidityBps, 0),
    comfortableLosingPercent: percentFromBps(m.maxDrawdownBps, 0),
    adjustWhenOffTargetByPercent: percentFromBps(m.rebalanceThresholdBps, 0),
  };
}

// ------------------------------------------------------------------- holdings

export function toPlanHolding(p: {
  token: string;
  symbol: string;
  targetBps: number;
  minBps: number;
  maxBps: number;
  isLiquid: boolean;
}): PlanHolding {
  return {
    id: p.token,
    name: displayName(p.symbol),
    code: p.symbol,
    sharePercent: percentFromBps(p.targetBps),
    allowedRange: {
      minPercent: percentFromBps(p.minBps),
      maxPercent: percentFromBps(p.maxBps),
    },
    isAvailableCash: p.isLiquid,
  };
}

/** Token base units -> a decimal string, without a float in the middle. */
export function unitsToDecimal(amount: bigint, decimals: number, maxPlaces = 6): string {
  const negative = amount < 0n;
  const abs = negative ? -amount : amount;
  const base = 10n ** BigInt(decimals);
  const whole = abs / base;
  let frac = (abs % base).toString().padStart(decimals, "0").slice(0, maxPlaces).replace(/0+$/, "");
  const text = frac ? `${whole}.${frac}` : `${whole}`;
  return negative ? `-${text}` : text;
}

export function toHolding(p: OnchainPosition): Holding {
  return {
    id: p.token,
    name: displayName(p.symbol),
    code: p.symbol,
    value: moneyFromE18(p.valueE18),
    sharePercent: percentFromBps(p.allocationBps),
    targetPercent: percentFromBps(p.targetBps),
    offTargetByPercent: percentFromBps(p.driftBps),
    isAvailableCash: p.isLiquid,
    units: unitsToDecimal(p.amount, p.decimals),
  };
}

// ---------------------------------------------------------------------- money

export function toMoneyView(state: PortfolioState, asOf = new Date()): MoneyView {
  const available = state.positions.reduce((acc, p) => (p.isLiquid ? acc + p.valueE18 : acc), 0n);
  const invested = state.totalValueE18 - available;
  return {
    total: moneyFromE18(state.totalValueE18),
    available: moneyFromE18(available),
    invested: moneyFromE18(invested),
    holdings: state.positions.map(toHolding),
    isEmpty: state.totalValueE18 === 0n,
    asOf: asOf.toISOString(),
  };
}

// ------------------------------------------------------------------- progress

const MONTH_SECONDS = 30.44 * 86_400;

export function monthsUntil(unixSeconds: number, now = new Date()): number {
  return Math.max(0, Math.round((unixSeconds - Math.floor(now.getTime() / 1000)) / MONTH_SECONDS));
}

/**
 * Progress toward the goal.
 *
 * Every forward-looking figure assumes ZERO growth. Modalis does not promise a return, so the
 * only honest answer to "will I get there?" is framed in money the person themselves adds.
 */
export function toProgress(
  state: PortfolioState,
  currentMonthlyContributionE18: bigint,
  now = new Date(),
): Progress {
  const saved = state.totalValueE18;
  const target = state.mandate.targetValue;
  const monthsRemaining = monthsUntil(state.mandate.targetDate, now);
  const remaining = target > saved ? target - saved : 0n;
  const monthlyNeeded = monthsRemaining > 0 ? remaining / BigInt(monthsRemaining) : remaining;

  const percentComplete =
    target === 0n ? 0 : Number(((saved * 10_000n) / target).toString()) / 100;

  let status: ProgressStatus;
  if (saved === 0n) status = "not_started";
  else if (remaining === 0n) status = "on_track";
  else if (currentMonthlyContributionE18 >= monthlyNeeded) status = "on_track";
  // Within 20% of the required contribution reads as "slightly behind" rather than alarming.
  else if (currentMonthlyContributionE18 * 10n >= monthlyNeeded * 8n) status = "slightly_behind";
  else status = "behind";

  return {
    status,
    saved: moneyFromE18(saved),
    target: moneyFromE18(target),
    percentComplete: Number(percentComplete.toFixed(1)),
    monthsRemaining,
    targetDate: new Date(state.mandate.targetDate * 1000).toISOString(),
    remaining: moneyFromE18(remaining),
    monthlyToStayOnTrack: moneyFromE18(monthlyNeeded),
    currentMonthlyContribution: moneyFromE18(currentMonthlyContributionE18),
    summary: progressSummary(status, monthsRemaining, moneyFromE18(monthlyNeeded).amount),
  };
}

function progressSummary(status: ProgressStatus, months: number, monthly: string): string {
  switch (status) {
    case "not_started":
      return "You haven't added any money yet. Once you do, you'll see your progress here.";
    case "on_track":
      return months > 0
        ? `You're on track. Keep going and you'll reach your goal with about ${months} ${months === 1 ? "month" : "months"} to spare.`
        : "You've reached your goal.";
    case "slightly_behind":
      return `You're a little short. Adding about $${monthly} a month would put you back on track.`;
    case "behind":
      return `At your current pace you won't reach the goal in time. Adding about $${monthly} a month would close the gap.`;
  }
}

// ----------------------------------------------------------------- plan issues

/** Protocol violation codes -> what the person needs to understand. */
export function toPlanIssues(
  risk: RiskAssessment,
  positions: OnchainPosition[],
  rules: PlanRules,
): PlanIssue[] {
  const nameFor = (token?: string) =>
    positions.find((p) => p.token.toLowerCase() === token?.toLowerCase())?.symbol;

  const issues: PlanIssue[] = risk.violations.map((v: Violation) => {
    const code = v.code;
    const holdingName = nameFor(v.token) ? displayName(nameFor(v.token)!) : undefined;
    const current = percentFromBps(v.bps);
    const limit = percentFromBps(v.limitBps);

    switch (code) {
      case "MAX_ALLOCATION_EXCEEDED":
        return {
          code: "too_much_in_one",
          holdingName,
          currentPercent: current,
          limitPercent: limit,
          message: `${holdingName ?? "One investment"} has grown to ${current}% of your money, above the ${limit}% limit you set for any single investment.`,
        };
      case "MIN_LIQUIDITY_BREACHED":
        return {
          code: "not_enough_available",
          currentPercent: current,
          limitPercent: limit,
          message: `The money you keep available has fallen to ${current}%, below the ${limit}% you asked for.`,
        };
      case "ALLOCATION_ABOVE_RANGE":
        return {
          code: "outside_allowed_range",
          holdingName,
          currentPercent: current,
          limitPercent: limit,
          message: `${holdingName ?? "One investment"} is at ${current}%, above the ${limit}% top of the range you approved for it.`,
        };
      case "ALLOCATION_BELOW_MIN":
        return {
          code: "outside_allowed_range",
          holdingName,
          currentPercent: current,
          limitPercent: limit,
          message: `${holdingName ?? "One investment"} has fallen to ${current}%, below the ${limit}% bottom of the range you approved for it.`,
        };
    }
  });

  // Drift alone is worth saying only when nothing stronger is wrong.
  if (issues.length === 0 && risk.status === "DRIFT") {
    issues.push({
      code: "off_target",
      currentPercent: percentFromBps(risk.maxDriftBps),
      limitPercent: rules.adjustWhenOffTargetByPercent,
      message: `Your money has drifted ${percentFromBps(risk.maxDriftBps)}% from the mix your plan asks for, past the ${rules.adjustWhenOffTargetByPercent}% point where you asked Modalis to step in.`,
    });
  }
  return issues;
}

export function toPlanHealth(risk: RiskAssessment): "on_plan" | "drifting" | "off_plan" {
  return risk.status === "OK" ? "on_plan" : risk.status === "DRIFT" ? "drifting" : "off_plan";
}

// ----------------------------------------------------------------------- plan

export function planFromChain(
  state: PlanState,
  goal: Goal,
  riskLevel: RiskLevel,
  options: { planId?: string | null; adjustmentsEnabled: boolean; approvedAt?: string } ,
): Plan {
  const rules = rulesFromMandate(state.mandate);
  return {
    id: options.planId ?? null,
    status: state.mandate.active ? "active" : "paused",
    version: state.mandate.version,
    riskLevel,
    howMoneyIsSpread: state.positions.map(toPlanHolding),
    rules,
    goal,
    summary: planSummary(rules, goal),
    approvedAt: options.approvedAt,
    adjustmentsEnabled: options.adjustmentsEnabled,
  };
}

/** The plan in one paragraph, for the approval screen and for any summary view. */
export function planSummary(rules: PlanRules, goal: Goal): string {
  return [
    `You're saving ${moneyInSentence(goal.target)} for ${goal.name.toLowerCase()}.`,
    `No single investment may go above ${rules.maxInOneInvestmentPercent}% of your money,`,
    `at least ${rules.moneyKeptAvailablePercent}% stays available to withdraw,`,
    `and Modalis steps in when anything drifts more than ${rules.adjustWhenOffTargetByPercent}% from where it should be.`,
    `Modalis can only act inside these rules, and only you can change them or take your money out.`,
  ].join(" ");
}

/** A mandate draft from the intelligence layer, as a plan the person can approve. */
export function planFromDraft(draft: MandateDraft, goal: Goal, planId?: string | null): Plan {
  const rules: PlanRules = {
    maxInOneInvestmentPercent: percentFromBps(draft.params.maxSingleAssetBps, 0),
    moneyKeptAvailablePercent: percentFromBps(draft.params.minLiquidityBps, 0),
    comfortableLosingPercent: percentFromBps(draft.params.maxDrawdownBps, 0),
    adjustWhenOffTargetByPercent: percentFromBps(draft.params.rebalanceThresholdBps, 0),
  };
  return {
    id: planId ?? null,
    status: "draft",
    version: 0,
    riskLevel: toRiskLevel(draft.profile),
    howMoneyIsSpread: draft.allocations.map((a) =>
      toPlanHolding({
        token: a.token,
        symbol: a.symbol,
        targetBps: a.targetBps,
        minBps: a.minBps,
        maxBps: a.maxBps,
        isLiquid: a.isLiquid,
      }),
    ),
    rules,
    goal,
    summary: planSummary(rules, goal),
    adjustmentsEnabled: false,
  };
}

// -------------------------------------------------------------------- receipt

export function toReceipt(hash: string, confirmed: boolean, explorerBase?: string, at?: Date): Receipt {
  const base = explorerBase?.replace(/\/$/, "");
  return {
    reference: hash,
    url: base ? `${base}/tx/${hash}` : undefined,
    confirmed,
    at: at?.toISOString(),
  };
}

/** Goal, built from what the person told us plus the plan's own target. */
export function toGoal(input: {
  id?: string | null;
  kind: Goal["kind"];
  name: string;
  description?: string;
  savings?: Goal["savings"];
  targetE18: bigint;
  targetDateUnix: number;
  startingAmountE18: bigint;
  contributionE18: bigint;
  cadence: Goal["contribution"]["cadence"];
  now?: Date;
}): Goal {
  return {
    id: input.id ?? null,
    kind: input.kind,
    name: input.name,
    description: input.description,
    ...(input.savings ? { savings: input.savings } : {}),
    target: moneyFromE18(input.targetE18, 0),
    targetDate: new Date(input.targetDateUnix * 1000).toISOString(),
    monthsRemaining: monthsUntil(input.targetDateUnix, input.now),
    startingAmount: moneyFromE18(input.startingAmountE18, 0),
    contribution: { amount: moneyFromE18(input.contributionE18, 0), cadence: input.cadence },
  };
}

export { money };
