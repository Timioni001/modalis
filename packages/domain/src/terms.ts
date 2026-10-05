/**
 * The terminology boundary.
 *
 * Modalis is a consumer financial product running on sophisticated infrastructure. This file is
 * the single place where protocol vocabulary becomes product vocabulary, so the two never drift
 * and nobody has to remember the mapping.
 *
 * The rule: technical concepts belong in the implementation, not in the user's vocabulary.
 *
 *   PortfolioMandate   is how the rules are enforced.   "Your plan"   is what the user has.
 *   Rebalance          is how the portfolio is corrected. "An adjustment" is what the user sees.
 *
 * Nothing here renames a contract. `PortfolioMandate`, `PortfolioVault` and `RebalanceExecutor`
 * keep their names in Solidity, where they are precise and correct. This layer sits above them.
 */

/** Concepts that exist only below the domain layer. A user never sees these words. */
export const INTERNAL_ONLY = [
  "PortfolioMandate",
  "PortfolioVault",
  "AssetRegistry",
  "RebalanceExecutor",
  "RiskSignalReceiver",
  "KuruAdapter",
  "Monad",
  "Kuru",
  "Chainlink CRE",
  "Envio",
  "Alchemy",
  "basis points",
  "bps",
  "nonce",
  "adapter",
  "slippage",
  "oracle",
  "calldata",
  "gas",
  "wei",
  "ERC-20",
  "AMM",
  "orderbook",
] as const;

/**
 * Protocol concept -> the words the product uses.
 *
 * Used for documentation, for the glossary a "show me the technical detail" view would render,
 * and as the reference the domain models are named against.
 */
export const TERMS = {
  portfolioMandate: {
    protocol: "PortfolioMandate",
    product: "Plan",
    describe: "The rules Modalis manages your money by, which only you can change.",
  },
  mandateVersion: {
    protocol: "mandate version",
    product: "plan version",
    describe: "Each time you change your plan it becomes a new version, so the history is clear.",
  },
  riskProfile: {
    protocol: "risk profile",
    product: "Risk level",
    describe: "How much ups and downs your plan is built to handle.",
  },
  allocation: {
    protocol: "target allocation",
    product: "How your money is spread",
    describe: "The share of your money held in each investment.",
  },
  rebalance: {
    protocol: "rebalance",
    product: "Adjustment",
    describe: "A small change that brings your money back in line with your plan.",
  },
  rebalanceProposal: {
    protocol: "rebalance proposal",
    product: "Recommended adjustment",
    describe: "A change Modalis suggests, which your rules have to allow before it can happen.",
  },
  maxDrawdown: {
    protocol: "maximum drawdown",
    product: "How much you're comfortable losing",
    describe: "The largest drop your plan is built to tolerate before it gets more cautious.",
  },
  minLiquidity: {
    protocol: "liquidity floor",
    product: "Money kept available",
    describe: "The share of your money that stays easy to withdraw.",
  },
  maxSingleAsset: {
    protocol: "concentration limit",
    product: "Maximum in one investment",
    describe: "No single investment may grow past this share of your money.",
  },
  allocationDrift: {
    protocol: "allocation drift",
    product: "Off target",
    describe: "How far your money has moved from the mix your plan asks for.",
  },
  rebalanceThreshold: {
    protocol: "rebalance threshold",
    product: "When Modalis steps in",
    describe: "How far off target something can get before Modalis suggests a change.",
  },
  portfolioVault: {
    protocol: "PortfolioVault",
    product: "Your money",
    describe: "Where your money is held. Only you can take it out.",
  },
  transactionHash: {
    protocol: "transaction hash",
    product: "Receipt",
    describe: "Proof of what happened, which anyone can check.",
  },
  settlement: {
    protocol: "settlement on Monad",
    product: "Confirmed",
    describe: "The action finished and is recorded for good.",
  },
} as const;

export type TermKey = keyof typeof TERMS;

export function productTerm(key: TermKey): string {
  return TERMS[key].product;
}

export function explainTerm(key: TermKey): string {
  return TERMS[key].describe;
}

/**
 * Development guard: flags protocol vocabulary that escaped into user-facing copy.
 *
 * Used by the domain tests. The point is to catch "your mandate's maxSingleAssetBps" reaching a
 * person, not to police internal identifiers.
 */
export function findLeakedJargon(text: string): string[] {
  const lowered = text.toLowerCase();
  return INTERNAL_ONLY.filter((term) => {
    const t = term.toLowerCase();
    // Word-boundary match so "adapter" does not fire on "adapted".
    return new RegExp(`\\b${t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`).test(lowered);
  });
}
