/**
 * Explanation engine.
 *
 * Every important portfolio action gets a stored, user-readable "why". The explanation is built
 * from facts the system computed — never from a model's impression of what happened. The LLM, when
 * configured, only rewrites those facts more fluently (see llm.ts); the deterministic text below
 * is always available and is what gets stored if the model is unavailable.
 *
 * Tone rules, from the product brief: no "AI detected an opportunity", no projections presented as
 * promises, no jargon.
 */
import type { MandateDraft } from "./types.ts";

export type ViolationFact = {
  code: "MAX_ALLOCATION_EXCEEDED" | "ALLOCATION_ABOVE_RANGE" | "ALLOCATION_BELOW_MIN" | "MIN_LIQUIDITY_BREACHED";
  symbol?: string;
  bps: number;
  limitBps: number;
};

export type RebalanceFacts = {
  sellSymbol: string;
  buySymbol: string;
  sellFromBps: number;
  buyFromBps: number;
  violations: ViolationFact[];
  maxDriftBps: number;
  rebalanceThresholdBps: number;
};

const pct = (bps: number) => `${(bps / 100).toFixed(1)}%`;
const pctRound = (bps: number) => `${Math.round(bps / 100)}%`;

/** Why a mandate breach happened, in facts. */
export function breachFacts(violations: ViolationFact[], maxDriftBps: number, thresholdBps: number): string[] {
  if (violations.length === 0) {
    return [
      `Your allocation has drifted ${pct(maxDriftBps)} from its target, past the ${pct(thresholdBps)} point where your mandate asks for a rebalance.`,
    ];
  }
  return violations.map((v) => {
    const name = v.symbol ?? "Your cash reserve";
    switch (v.code) {
      case "MAX_ALLOCATION_EXCEEDED":
        return `${name} grew to ${pct(v.bps)} of your portfolio, above the ${pct(v.limitBps)} limit you approved for any single asset.`;
      case "ALLOCATION_ABOVE_RANGE":
        return `${name} is at ${pct(v.bps)}, above the ${pct(v.limitBps)} top of its approved range.`;
      case "ALLOCATION_BELOW_MIN":
        return `${name} fell to ${pct(v.bps)}, below the ${pct(v.limitBps)} bottom of its approved range.`;
      case "MIN_LIQUIDITY_BREACHED":
        return `Your cash reserve fell to ${pct(v.bps)}, below the ${pct(v.limitBps)} minimum you set.`;
    }
  });
}

/** The deterministic rebalance explanation. Always safe to store and display. */
export function explainRebalance(f: RebalanceFacts): { body: string; facts: string[] } {
  const facts = [
    ...breachFacts(f.violations, f.maxDriftBps, f.rebalanceThresholdBps),
    `${f.sellSymbol} is ${pct(f.sellFromBps)} of the portfolio and ${f.buySymbol} is ${pct(f.buyFromBps)}.`,
    `Modalis moved the smallest amount it could from ${f.sellSymbol} into ${f.buySymbol} to bring the portfolio back inside your rules.`,
  ];
  return { body: facts.join(" "), facts };
}

/** Explanation for a proposal the contract rejected. This is the security boundary speaking. */
export function explainRejection(errorName: string, detail?: string): { body: string; facts: string[] } {
  const facts: string[] = [];
  switch (errorName) {
    case "MAX_ALLOCATION_EXCEEDED":
      facts.push("The proposed action would have pushed one asset above the single-asset limit in your mandate.");
      break;
    case "MIN_LIQUIDITY_BREACHED":
      facts.push("The proposed action would have taken your cash reserve below the minimum you set.");
      break;
    case "ALLOCATION_ABOVE_RANGE":
    case "ALLOCATION_BELOW_MIN":
      facts.push("The proposed action would have moved an asset outside the range you approved for it.");
      break;
    case "SLIPPAGE_TOO_LOOSE":
      facts.push("The proposed trade accepted a worse price than your mandate allows.");
      break;
    case "STALE_MANDATE_VERSION":
      facts.push("The proposal was built against an older version of your mandate, so it was refused.");
      break;
    case "INVALID_NONCE":
      facts.push("The proposal had already been used, so it could not be replayed.");
      break;
    case "PROPOSAL_EXPIRED":
      facts.push("The proposal passed its deadline before it was submitted.");
      break;
    case "NOT_AUTHORIZED":
      facts.push("The account that submitted the proposal is not authorised to act on your portfolio.");
      break;
    default:
      facts.push(`The proposed action was refused by your mandate${detail ? ` (${detail})` : ""}.`);
  }
  facts.push("Nothing moved. Your portfolio is unchanged and your funds never left the vault.");
  return { body: facts.join(" "), facts };
}

/** Plain-language summary of the mandate, for the approval screen. */
export function explainMandate(draft: MandateDraft): { body: string; facts: string[] } {
  const p = draft.params;
  const topAssets = [...draft.allocations]
    .sort((a, b) => b.targetBps - a.targetBps)
    .slice(0, 3)
    .map((a) => `${a.symbol} ${pctRound(a.targetBps)}`)
    .join(", ");

  const facts = [
    `Your goal is $${draft.goal.targetValue.toLocaleString("en-US")} in ${draft.goal.horizonMonths} months.`,
    `No single investment may exceed ${pctRound(p.maxSingleAssetBps)} of the portfolio.`,
    `At least ${pctRound(p.minLiquidityBps)} stays in cash-like assets you can reach quickly.`,
    `Modalis acts when any holding drifts more than ${pctRound(p.rebalanceThresholdBps)} from its target.`,
    `Trades may not accept a price worse than ${pct(p.maxSlippageBps)} off the quoted rate.`,
    `The starting plan is ${topAssets}.`,
  ];

  return {
    body:
      `This is the policy Modalis will use to manage your portfolio. ${facts.join(" ")} ` +
      `Modalis can only act inside these rules, and only you can change them or withdraw your money.`,
    facts,
  };
}

/** Risk-state summary for the dashboard's health panel. */
export function explainRiskState(input: {
  status: "OK" | "DRIFT" | "BREACH";
  maxDriftBps: number;
  liquidityBps: number;
  largestPositionBps: number;
  maxSingleAssetBps: number;
  minLiquidityBps: number;
}): string {
  switch (input.status) {
    case "OK":
      return (
        `Your portfolio is within every rule you approved. The largest holding is ` +
        `${pct(input.largestPositionBps)} against a ${pctRound(input.maxSingleAssetBps)} limit, and ` +
        `${pct(input.liquidityBps)} is in cash against a ${pctRound(input.minLiquidityBps)} minimum.`
      );
    case "DRIFT":
      return (
        `Your portfolio is still inside your rules, but one holding has drifted ` +
        `${pct(input.maxDriftBps)} from its target. Modalis will propose a correction.`
      );
    case "BREACH":
      return (
        `Your portfolio has moved outside a limit you approved. Modalis will propose a correction, ` +
        `and the contract will only accept it if the result is back inside your rules.`
      );
  }
}
