/**
 * Adjustments: noticing when the plan has moved off target, and proposing the smallest fix.
 *
 * The security story in one place:
 *
 *   Modalis RECOMMENDS.  The person's RULES decide.  The CONTRACT enforces.
 *
 * `recommendAdjustment` produces a suggestion and then checks it against the live contract before
 * anyone is asked to approve it. A suggestion the rules refuse comes back with
 * `allowedByYourRules: false` and an explanation — that is the system working, not an error.
 *
 * `executeAdjustment` re-derives the proposal from live chain state rather than trusting anything
 * from the caller. A client that could hand the server a proposal could choose the trade; it
 * cannot. The only thing a caller gets to say is "act on my plan now".
 */
import { readPortfolio, type PortfolioState } from "@modalis/chain";
import { assessRisk } from "@modalis/portfolio";
import { evaluate, execute, toEngineInputs } from "@modalis/risk-monitor";
import { explainRejection } from "@modalis/ai";
import { getAddress, type Address, type WalletClient } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import {
  displayName,
  rulesFromMandate,
  toPlanHealth,
  toPlanIssues,
  toReceipt,
  unitsToDecimal,
} from "../translate.ts";
import { percentFromBps, type Adjustment, type PlanHealth } from "../models.ts";

export type PlanStatusView = {
  health: PlanHealth;
  /** One sentence summarising where things stand. */
  summary: string;
  /** How far the furthest holding has moved from target, as a percentage. */
  furthestOffTargetPercent: number;
  availableMoneyPercent: number;
  largestHoldingPercent: number;
  needsAdjustment: boolean;
};

/** Is the plan on track, drifting, or off plan? Read-only; signs nothing. */
export async function getPlanStatus(ctx: DomainContext, owner: Address): Promise<PlanStatusView> {
  const state = await readPortfolio(ctx.client, ctx.deployment, getAddress(owner));
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "You don't have a plan yet.", 404);
  }
  const { rules: engineRules, allocations, values } = toEngineInputs(state);
  const risk = assessRisk(engineRules, allocations, values);
  const health = toPlanHealth(risk);

  return {
    health,
    summary: planStatusSummary(health, state, risk.largestPositionBps, risk.liquidityBps),
    furthestOffTargetPercent: percentFromBps(risk.maxDriftBps),
    availableMoneyPercent: percentFromBps(risk.liquidityBps),
    largestHoldingPercent: percentFromBps(risk.largestPositionBps),
    needsAdjustment: health !== "on_plan",
  };
}

function planStatusSummary(
  health: PlanHealth,
  state: PortfolioState,
  largestBps: number,
  liquidBps: number,
): string {
  const cap = Math.round(state.mandate.maxSingleAssetBps / 100);
  const floor = Math.round(state.mandate.minLiquidityBps / 100);
  switch (health) {
    case "on_plan":
      return `Your money is where your plan says it should be. Your largest investment is ${percentFromBps(largestBps)}% against your ${cap}% limit, and ${percentFromBps(liquidBps)}% is available against your ${floor}% minimum.`;
    case "drifting":
      return "Your money has drifted from your plan. Modalis will suggest a small change to bring it back.";
    case "off_plan":
      return "Your money has moved outside a rule you set. Modalis will suggest a change, and your rules have to allow it before anything happens.";
  }
}

/**
 * What Modalis suggests doing about it.
 *
 * Simulates the change against live chain state before returning, so the person is told whether
 * their rules permit it BEFORE they are asked to approve anything.
 */
export async function recommendAdjustment(ctx: DomainContext, owner: Address): Promise<Adjustment> {
  const who = getAddress(owner);
  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "You don't have a plan yet.", 404);
  }

  const outcome = await evaluate(
    { client: ctx.client, deployment: ctx.deployment, ai: ctx.ai, rpcUrl: ctx.rpcUrl },
    who,
  );

  const rules = rulesFromMandate(state.mandate);
  const { rules: engineRules, allocations, values } = toEngineInputs(state);
  const risk = assessRisk(engineRules, allocations, values);
  const reasons = toPlanIssues(risk, state.positions, rules);
  const before = state.positions.map((p) => ({
    name: displayName(p.symbol),
    percent: percentFromBps(p.allocationBps),
  }));

  if (outcome.kind !== "action_needed") {
    return {
      id: null,
      status: "none_needed",
      reasons: [],
      explanation:
        "Your money is where your plan says it should be, so there's nothing to change right now.",
      allowedByYourRules: true,
    };
  }

  // The planner could not find a single change that returns the plan to full compliance.
  if (!outcome.proposal) {
    return {
      id: null,
      status: "no_safe_option",
      reasons,
      explanation:
        "Your plan has moved off target, but there's no single change that brings everything back " +
        "inside your rules at once. Modalis won't make a partial change that leaves another rule " +
        "broken. Adding money, or adjusting your plan, would resolve this.",
      allowedByYourRules: false,
      blockedBecause: outcome.unplannable,
      change: { sell: { name: "", code: "", amount: "" }, buy: { name: "", code: "", atLeast: "" }, before },
    };
  }

  const action = outcome.proposal;
  const sell = state.positions.find((p) => p.token.toLowerCase() === action.proposal.tokenIn.toLowerCase());
  const buy = state.positions.find((p) => p.token.toLowerCase() === action.proposal.tokenOut.toLowerCase());

  const change = {
    sell: {
      name: sell ? displayName(sell.symbol) : "an investment",
      code: sell?.symbol ?? "",
      amount: sell ? unitsToDecimal(action.proposal.amountIn, sell.decimals) : String(action.proposal.amountIn),
    },
    buy: {
      name: buy ? displayName(buy.symbol) : "another investment",
      code: buy?.symbol ?? "",
      atLeast: buy
        ? unitsToDecimal(action.proposal.minAmountOut, buy.decimals)
        : String(action.proposal.minAmountOut),
    },
    before,
  };

  if (!action.simulation.ok) {
    return {
      id: null,
      status: "not_allowed",
      reasons,
      explanation: explainRejection(action.simulation.errorName).body,
      change,
      allowedByYourRules: false,
      blockedBecause: humanRuleName(action.simulation.errorName),
    };
  }

  return {
    id: null,
    status: "recommended",
    reasons,
    explanation: action.explanation,
    change,
    allowedByYourRules: true,
  };
}

/** Contract error -> the rule it corresponds to, in the person's words. */
function humanRuleName(errorName: string): string {
  switch (errorName) {
    case "MAX_ALLOCATION_EXCEEDED":
      return "your limit on how much can sit in one investment";
    case "MIN_LIQUIDITY_BREACHED":
      return "the amount of money you keep available";
    case "ALLOCATION_ABOVE_RANGE":
    case "ALLOCATION_BELOW_MIN":
      return "the range you approved for that investment";
    case "SLIPPAGE_TOO_LOOSE":
      return "the price protection on your plan";
    case "STALE_MANDATE_VERSION":
      return "your plan changed while this was being prepared";
    case "PROPOSAL_EXPIRED":
      return "this suggestion took too long to approve";
    case "NOT_AUTHORIZED":
      return "Modalis isn't currently allowed to adjust your plan";
    default:
      return "one of your plan's rules";
  }
}

/**
 * Carries out the adjustment.
 *
 * The proposal is rebuilt from live chain state, never taken from the caller. The contract then
 * re-checks authorisation, plan version, deadline, replay, price protection, venue and — after
 * the trade — that the result still satisfies every one of the person's rules. A failure at any
 * point reverts the whole thing, so nothing moves.
 */
export async function executeAdjustment(
  ctx: DomainContext,
  owner: Address,
  managerWallet: WalletClient,
): Promise<Adjustment> {
  const who = getAddress(owner);
  const outcome = await evaluate(
    { client: ctx.client, deployment: ctx.deployment, ai: ctx.ai, rpcUrl: ctx.rpcUrl },
    who,
  );

  if (outcome.kind !== "action_needed" || !outcome.proposal) {
    throw new DomainError(
      "nothing_to_do",
      "There's nothing to adjust right now — your money is where your plan says it should be.",
      409,
    );
  }

  const action = outcome.proposal;
  if (!action.simulation.ok) {
    return {
      id: null,
      status: "not_allowed",
      reasons: [],
      explanation: explainRejection(action.simulation.errorName).body,
      allowedByYourRules: false,
      blockedBecause: humanRuleName(action.simulation.errorName),
    };
  }

  const result = await execute(managerWallet, ctx.client, ctx.deployment, action);

  if (!result.submitted || !result.hash || result.rejectedWith) {
    return {
      id: null,
      status: "failed",
      reasons: [],
      explanation:
        "The change didn't go through, so nothing moved. Your money is exactly where it was.",
      allowedByYourRules: true,
      blockedBecause: result.rejectedWith ?? result.skipped,
      ...(result.hash
        ? { receipt: toReceipt(result.hash, false, ctx.explorerUrl, new Date()) }
        : {}),
    };
  }

  return {
    id: null,
    status: "done",
    reasons: [],
    explanation: action.explanation,
    allowedByYourRules: true,
    receipt: toReceipt(result.hash, true, ctx.explorerUrl, new Date()),
  };
}
