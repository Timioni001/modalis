/**
 * The asset registry (§12): what each investment IS, in one place.
 *
 * The on-chain AssetRegistry holds what the contract must enforce — enabled, per-asset ceiling,
 * decimals, whether it counts as cash. This holds what the person and the planner need to know
 * and the chain has no reason to store: its name, what kind of thing it is, what it depends on,
 * how quickly it can be turned into cash, and what role it may play in a plan.
 *
 * Before this existed, the same facts lived in three tables (display names in the domain, asset
 * classes and weights in the web app). They now read from here.
 *
 * The four assets are DEMO tokens on a test network, and the registry says so rather than
 * describing them as the real things they stand in for.
 */
export type AssetType = "cash" | "crypto" | "bond";
export type AssetClass = "growth" | "defensive" | "liquid";

export type AssetMeta = {
  symbol: string;
  /** What a person reads. */
  name: string;
  type: AssetType;
  /** The planner's bucket. */
  assetClass: AssetClass;
  /** Relative weight within its bucket when the planner splits growth money. */
  plannerWeight: number;
  chain: "Monad";
  /** What the token actually is, honestly. */
  issuer: string;
  /** How quickly it can become cash. */
  liquidity: "instant" | "market";
  /** The risks holding it carries, in plain words. Used for the exposure view. */
  riskFactors: string[];
  /** What it may be used for in a plan. */
  roles: ("reserve" | "growth" | "stability")[];
  demo: boolean;
};

export const ASSETS: Record<string, AssetMeta> = {
  mUSD: {
    symbol: "mUSD", name: "Cash", type: "cash", assetClass: "liquid", plannerWeight: 1, chain: "Monad",
    issuer: "Modalis demo token (test network)", liquidity: "instant",
    riskFactors: ["Issuer of the cash token"], roles: ["reserve"], demo: true,
  },
  mBTC: {
    symbol: "mBTC", name: "Bitcoin", type: "crypto", assetClass: "growth", plannerWeight: 6, chain: "Monad",
    issuer: "Modalis demo token (test network)", liquidity: "market",
    riskFactors: ["Crypto price swings", "Market depth when selling"], roles: ["growth"], demo: true,
  },
  mETH: {
    symbol: "mETH", name: "Ethereum", type: "crypto", assetClass: "growth", plannerWeight: 4, chain: "Monad",
    issuer: "Modalis demo token (test network)", liquidity: "market",
    riskFactors: ["Crypto price swings", "Market depth when selling"], roles: ["growth"], demo: true,
  },
  mBOND: {
    symbol: "mBOND", name: "Bonds", type: "bond", assetClass: "defensive", plannerWeight: 1, chain: "Monad",
    issuer: "Modalis demo token (test network)", liquidity: "market",
    riskFactors: ["Interest-rate changes", "Market depth when selling"], roles: ["stability"], demo: true,
  },
};

/** Registry entry for a symbol, or a conservative unknown — never an invented description. */
export function assetMeta(symbol: string): AssetMeta {
  return ASSETS[symbol] ?? {
    symbol, name: symbol, type: "crypto", assetClass: "growth", plannerWeight: 1, chain: "Monad",
    issuer: "Not in Modalis's registry", liquidity: "market",
    riskFactors: ["Unknown — not in Modalis's registry"], roles: [], demo: false,
  };
}
