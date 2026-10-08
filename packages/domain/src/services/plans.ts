/**
 * Plans: turning a goal into rules, and reading the rules that are live.
 *
 * A plan is created here but APPROVED by the person's own wallet signing `setMandate`. The server
 * never signs that, because a plan is the boundary on Modalis's own authority — letting a server
 * key write it would defeat the point.
 */
import { readManager, readPortfolio, type Deployment } from "@modalis/chain";
import {
  buildMandateDraft,
  interpretGoal,
  usdToE18,
  type InterviewAnswers,
  type MandateDraft,
  type UniverseAsset,
} from "@modalis/ai";
import { getAddress, type Address } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import { monthsUntil, planFromChain, planFromDraft, toGoal, toRiskLevel } from "../translate.ts";
import type { Goal, Plan } from "../models.ts";

const ZERO = "0x0000000000000000000000000000000000000000";

/** What a person tells Modalis. Deliberately the vocabulary of the questions, not of finance. */
export type GoalAnswers = {
  /** What the money is for. */
  goalKind: Goal["kind"];
  /** Their own words, optional. Read by the AI layer when present. */
  inTheirWords?: string;
  /** Dollars. */
  targetAmount: number;
  /** Dollars they have now. */
  startingAmount: number;
  /** Dollars they can add. */
  contributionAmount: number;
  contributionCadence: "weekly" | "monthly" | "quarterly";
  /** How long until they need it. */
  monthsUntilNeeded: number;
  /** What they'd do if their money fell 12%. */
  ifItFellResponse: "sell_everything" | "sell_some" | "do_nothing" | "invest_more";
  /** The largest drop they'd accept, as a percentage. */
  comfortableLosingPercent: number;
  /** How much needs to stay reachable. */
  moneyKeptAvailable: "none" | "some" | "significant";
  /** How steady their income is. */
  incomeSteadiness: "unstable" | "stable" | "very_stable";
};

const GOAL_NAMES: Record<Goal["kind"], string> = {
  house: "A home",
  education: "Education",
  long_term_wealth: "Long-term wealth",
  emergency_reserve: "An emergency reserve",
  retirement: "Retirement",
  major_purchase: "A major purchase",
  travel: "Travel",
  custom: "Your goal",
};

/** Domain answers -> the intelligence layer's input shape. */
export function toInterviewAnswers(answers: GoalAnswers): InterviewAnswers {
  return {
    goalType: answers.goalKind,
    goalDescription: answers.inTheirWords,
    targetValue: answers.targetAmount,
    initialAmount: answers.startingAmount,
    contributionAmount: answers.contributionAmount,
    contributionCadence: answers.contributionCadence,
    horizonMonths: answers.monthsUntilNeeded,
    drawdownResponse: answers.ifItFellResponse,
    maxTolerableDrawdownPct: answers.comfortableLosingPercent,
    liquidityNeed: answers.moneyKeptAvailable,
    incomeStability: answers.incomeSteadiness,
  };
}

export type DraftedPlan = {
  plan: Plan;
  /**
   * What the person's wallet needs to sign to make this plan live. Opaque to the UI: it hands
   * this back to the approve step unchanged.
   */
  approval: {
    params: MandateDraft["params"];
    allocations: { token: string; targetBps: number; minBps: number; maxBps: number }[];
  };
  /** Set when the AI read a free-text goal: what it understood, for confirmation. */
  understoodAs?: string;
};

/**
 * Creates a plan from a goal. Writes nothing on-chain.
 *
 * The allocation and every rule come from the deterministic pipeline, which refuses to produce a
 * plan the contract would reject — so a person is never asked to approve something that would
 * fail. The AI is used only to read free text, and only to fill in the goal's own fields.
 */
export async function createPlan(
  ctx: DomainContext,
  answers: GoalAnswers,
  universe: UniverseAsset[],
  now = new Date(),
): Promise<DraftedPlan> {
  let interview = toInterviewAnswers(answers);
  let understoodAs: string | undefined;

  if (answers.inTheirWords?.trim()) {
    const parsed = await interpretGoal(answers.inTheirWords, ctx.ai ?? {});
    // Low confidence means it did not really understand; fall back to what they typed in the form.
    if (parsed && parsed.confidence !== "low") {
      understoodAs = parsed.restatement;
      interview = {
        ...interview,
        goalType: parsed.goal.goalType,
        targetValue: parsed.goal.targetValue,
        horizonMonths: parsed.goal.horizonMonths,
      };
    }
  }

  let draft: MandateDraft;
  try {
    draft = buildMandateDraft(interview, universe, { now });
  } catch (err) {
    // buildMandateDraft throws rather than return a plan the chain would reject.
    throw new DomainError(
      "plan_not_possible",
      err instanceof Error ? err.message : "We couldn't build a plan from those answers.",
      422,
    );
  }

  const goal = toGoal({
    kind: interview.goalType,
    name: GOAL_NAMES[interview.goalType],
    description: answers.inTheirWords,
    targetE18: draft.params.targetValue,
    targetDateUnix: Number(draft.params.targetDate),
    startingAmountE18: usdToE18(interview.initialAmount),
    contributionE18: usdToE18(draft.monthlyContributionUsd),
    cadence: "monthly",
    now,
  });

  return {
    plan: planFromDraft(draft, goal),
    approval: {
      params: draft.params,
      allocations: draft.allocations.map((a) => ({
        token: a.token,
        targetBps: a.targetBps,
        minBps: a.minBps,
        maxBps: a.maxBps,
      })),
    },
    understoodAs,
  };
}

/**
 * The plan that is actually live, read from the chain.
 *
 * `goalContext` fills in what the chain cannot know — what the person called their goal and what
 * they said they'd contribute. Without a database those fall back to neutral values rather than
 * being invented.
 */
export async function getPlan(
  ctx: DomainContext,
  owner: Address,
  goalContext?: { id?: string | null; kind?: Goal["kind"]; name?: string; description?: string; startingAmountE18?: bigint; contributionE18?: bigint },
  now = new Date(),
): Promise<Plan> {
  const who = getAddress(owner);
  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "You don't have a plan yet.", 404);
  }

  const manager = await readManager(ctx.client, ctx.deployment, who);
  const kind = goalContext?.kind ?? "custom";

  const goal = toGoal({
    id: goalContext?.id ?? null,
    kind,
    name: goalContext?.name ?? GOAL_NAMES[kind],
    description: goalContext?.description,
    targetE18: state.mandate.targetValue,
    targetDateUnix: state.mandate.targetDate,
    startingAmountE18: goalContext?.startingAmountE18 ?? 0n,
    contributionE18: goalContext?.contributionE18 ?? 0n,
    cadence: "monthly",
    now,
  });

  // The risk level is reconstructed from the rules the person approved, because the chain stores
  // the rules rather than the score that produced them.
  const riskLevel = {
    level: inferRiskLevel(state.mandate.maxSingleAssetBps),
    score: inferRiskScore(state.mandate.maxSingleAssetBps),
    reasons: [
      `Your plan allows up to ${Math.round(state.mandate.maxSingleAssetBps / 100)}% in any one investment.`,
      `It keeps at least ${Math.round(state.mandate.minLiquidityBps / 100)}% of your money available.`,
    ],
  };

  return planFromChain(state, goal, riskLevel, {
    planId: goalContext?.id ?? null,
    adjustmentsEnabled: manager !== ZERO && manager.toLowerCase() !== ZERO,
  });
}

/** The concentration cap is the clearest signal of how adventurous a plan is. */
function inferRiskLevel(maxSingleAssetBps: number): "cautious" | "balanced" | "adventurous" {
  if (maxSingleAssetBps <= 2000) return "cautious";
  if (maxSingleAssetBps <= 3000) return "balanced";
  return "adventurous";
}

function inferRiskScore(maxSingleAssetBps: number): number {
  if (maxSingleAssetBps <= 1500) return 15;
  if (maxSingleAssetBps <= 2000) return 30;
  if (maxSingleAssetBps <= 3000) return 50;
  return 75;
}

export async function hasPlan(ctx: DomainContext, owner: Address): Promise<boolean> {
  const state = await readPortfolio(ctx.client, ctx.deployment, getAddress(owner));
  return state.hasMandate;
}

export { monthsUntil, toRiskLevel };
export type { Deployment, UniverseAsset };
