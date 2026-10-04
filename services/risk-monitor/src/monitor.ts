/**
 * The control loop.
 *
 *   read portfolio (Monad) -> assess risk -> plan the smallest valid trade -> quote a venue
 *   -> build a proposal -> SIMULATE -> submit -> settle -> re-read
 *
 * Three properties this file exists to guarantee:
 *
 *   1. It proposes; it never decides what is allowed. Every proposal goes through
 *      RebalanceExecutor, which re-checks authorisation, mandate version, deadline, nonce,
 *      slippage floor, venue approval and post-trade compliance.
 *   2. It simulates before submitting. A proposal the contract would reject costs no gas and
 *      produces a readable reason instead of a failed transaction.
 *   3. It never reports a transaction it did not send. Hashes come from the node.
 */
import {
  buildProposal,
  decodeRevert,
  readManager,
  readPortfolio,
  simulateProposal,
  submitProposal,
  usdToTokenAmount,
  type Deployment,
  type PortfolioState,
  type Proposal,
} from "@modalis/chain";
import {
  assessRisk,
  planRebalance,
  type Allocation,
  type MandateRules,
  type RiskAssessment,
} from "@modalis/portfolio";
import { explainRebalance, explainRejection, writeExplanation, type ViolationFact } from "@modalis/ai";
import { selectVenue, type VenueSelection } from "@modalis/execution";
import { AssetRegistryAbi, requireContract } from "@modalis/chain";
import type { Address, Hex, PublicClient, WalletClient } from "viem";

export type MonitorOutcome =
  | { kind: "no_mandate"; owner: Address }
  | { kind: "empty_portfolio"; owner: Address; state: PortfolioState }
  | { kind: "within_mandate"; owner: Address; state: PortfolioState; risk: RiskAssessment }
  | {
      kind: "action_needed";
      owner: Address;
      state: PortfolioState;
      risk: RiskAssessment;
      /** Absent when no single trade can return the portfolio to compliance. */
      proposal?: BuiltAction;
      /** Set when the planner could not find a compliant single trade. */
      unplannable?: string;
    };

export type BuiltAction = {
  proposal: Proposal;
  reason: string;
  explanation: string;
  venue: VenueSelection;
  adapterData: Hex;
  expectedAmountOut: bigint;
  simulation:
    | { ok: true; amountOut: bigint }
    | { ok: false; errorName: string; explanation: string; raw: string };
};

export type ExecutionResult = {
  submitted: boolean;
  hash?: Hex;
  blockNumber?: bigint;
  /** Why nothing was submitted, when nothing was. */
  skipped?: string;
  rejectedWith?: string;
};

/** Translates the on-chain portfolio into the engine's own shape. */
export function toEngineInputs(state: PortfolioState): {
  rules: MandateRules;
  allocations: Allocation[];
  values: bigint[];
} {
  const rules: MandateRules = {
    maxSingleAssetBps: state.mandate.maxSingleAssetBps,
    minLiquidityBps: state.mandate.minLiquidityBps,
    rebalanceThresholdBps: state.mandate.rebalanceThresholdBps,
    maxSlippageBps: state.mandate.maxSlippageBps,
    maxDrawdownBps: state.mandate.maxDrawdownBps,
    targetValue: state.mandate.targetValue,
    targetDate: state.mandate.targetDate,
  };
  const allocations: Allocation[] = state.positions.map((p) => ({
    token: p.token,
    symbol: p.symbol,
    targetBps: p.targetBps,
    minBps: p.minBps,
    maxBps: p.maxBps,
    isLiquid: p.isLiquid,
    assetMaxBps: p.assetMaxBps,
  }));
  return { rules, allocations, values: state.positions.map((p) => p.valueE18) };
}

export type EvaluateDeps = {
  client: PublicClient;
  deployment: Deployment;
  ai?: { apiKey?: string; model?: string };
  /** Monad RPC URL, needed by the Kuru SDK when Kuru is the selected venue. */
  rpcUrl?: string;
};

/**
 * Reads one portfolio and decides whether an action is required. Read-only: this never signs.
 */
export async function evaluate(deps: EvaluateDeps, owner: Address): Promise<MonitorOutcome> {
  const state = await readPortfolio(deps.client, deps.deployment, owner);
  if (!state.hasMandate) return { kind: "no_mandate", owner };
  if (state.totalValueE18 === 0n) return { kind: "empty_portfolio", owner, state };

  const { rules, allocations, values } = toEngineInputs(state);
  const risk = assessRisk(rules, allocations, values);
  if (risk.status === "OK") return { kind: "within_mandate", owner, state, risk };

  const plan = planRebalance(rules, allocations, values);
  if (!plan) {
    return {
      kind: "action_needed",
      owner,
      state,
      risk,
      unplannable:
        "No single trade returns this portfolio to full compliance. The post-trade check requires " +
        "the final state to satisfy every rule, so a partial fix is refused by design.",
    };
  }

  const sell = state.positions.find((p) => p.token === plan.sellToken);
  const buy = state.positions.find((p) => p.token === plan.buyToken);
  if (!sell || !buy) throw new Error("Planner returned a token outside the mandate's allocations");

  // --- Venue
  // Adapter addresses come from the deployment record rather than the environment, so the venue
  // reflects what is actually deployed on this chain.
  const venue = selectVenue({
    convert: (tokenIn, tokenOut, amountIn) =>
      deps.client.readContract({
        address: requireContract(deps.deployment, "assetRegistry"),
        abi: AssetRegistryAbi,
        functionName: "convert",
        args: [tokenIn, tokenOut, amountIn],
      }) as Promise<bigint>,
    adapters: {
      kuruAdapter: deps.deployment.contracts.kuruAdapter,
      demoAdapter: deps.deployment.contracts.executionAdapter,
    },
    rpcUrl: deps.rpcUrl,
  });

  const amountIn = await usdToTokenAmount(
    deps.client,
    deps.deployment,
    sell.token,
    plan.usdAmount,
    sell.decimals,
  );
  if (amountIn === 0n) {
    return { kind: "action_needed", owner, state, risk, unplannable: "The required trade rounds to zero token units." };
  }

  const quote = await venue.venue.quote({
    tokenIn: sell.token,
    tokenOut: buy.token,
    amountIn,
    decimalsIn: sell.decimals,
    decimalsOut: buy.decimals,
  });

  // --- Explanation, built from facts we computed
  const violations: ViolationFact[] = risk.violations.map((v) => ({
    code: v.code,
    symbol: state.positions.find((p) => p.token === v.token)?.symbol,
    bps: v.bps,
    limitBps: v.limitBps,
  }));
  const deterministic = explainRebalance({
    sellSymbol: sell.symbol,
    buySymbol: buy.symbol,
    sellFromBps: sell.allocationBps,
    buyFromBps: buy.allocationBps,
    violations,
    maxDriftBps: risk.maxDriftBps,
    rebalanceThresholdBps: state.mandate.rebalanceThresholdBps,
  });
  const { body: explanation } = await writeExplanation(
    { event: "rebalance_proposed", facts: deterministic.facts, fallback: deterministic.body },
    deps.ai ?? {},
  );

  // --- Proposal. The reason is hashed on-chain, so the stored text is auditable against it.
  const built = await buildProposal(deps.client, deps.deployment, {
    owner,
    adapter: quote.adapter,
    tokenIn: sell.token,
    tokenOut: buy.token,
    amountIn,
    reason: deterministic.body,
  });

  // --- Simulate as the manager, which is who will actually send it.
  const manager = await readManager(deps.client, deps.deployment, owner);
  const caller = manager !== "0x0000000000000000000000000000000000000000" ? manager : owner;
  const sim = await simulateProposal(deps.client, deps.deployment, built.proposal, quote.adapterData, caller);

  return {
    kind: "action_needed",
    owner,
    state,
    risk,
    proposal: {
      proposal: built.proposal,
      reason: deterministic.body,
      explanation,
      venue,
      adapterData: quote.adapterData,
      expectedAmountOut: quote.expectedAmountOut,
      simulation: sim.ok
        ? { ok: true, amountOut: sim.amountOut }
        : {
            ok: false,
            errorName: sim.errorName,
            explanation: explainRejection(sim.errorName).body,
            raw: sim.raw,
          },
    },
  };
}

/**
 * Submits an action. Refuses to submit anything that did not simulate cleanly, so the service
 * never burns gas on a proposal the mandate will reject.
 */
export async function execute(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  action: BuiltAction,
): Promise<ExecutionResult> {
  if (!action.simulation.ok) {
    return {
      submitted: false,
      skipped: "simulation failed",
      rejectedWith: action.simulation.errorName,
    };
  }

  try {
    const { hash } = await submitProposal(wallet, client, deployment, action.proposal, action.adapterData);
    const receipt = await client.waitForTransactionReceipt({ hash });
    if (receipt.status !== "success") {
      return { submitted: true, hash, blockNumber: receipt.blockNumber, rejectedWith: "transaction reverted" };
    }
    return { submitted: true, hash, blockNumber: receipt.blockNumber };
  } catch (err) {
    const { errorName } = decodeRevert(err);
    return { submitted: false, skipped: "submission failed", rejectedWith: errorName };
  }
}

/** One-line status for logs. */
export function describeOutcome(o: MonitorOutcome): string {
  switch (o.kind) {
    case "no_mandate":
      return `${o.owner}: no mandate on chain`;
    case "empty_portfolio":
      return `${o.owner}: mandate v${o.state.mandate.version}, nothing deposited yet`;
    case "within_mandate":
      return `${o.owner}: OK (max drift ${o.risk.maxDriftBps} bps, liquidity ${o.risk.liquidityBps} bps)`;
    case "action_needed": {
      const head = `${o.owner}: ${o.risk.status} (${o.risk.violations.map((v) => v.code).join(", ") || "drift"})`;
      if (o.unplannable) return `${head} — ${o.unplannable}`;
      const p = o.proposal!;
      return p.simulation.ok
        ? `${head} — proposal simulates OK via ${p.venue.venue.name}, expecting ${p.simulation.amountOut}`
        : `${head} — proposal REJECTED by the contract: ${p.simulation.errorName}`;
    }
  }
}
