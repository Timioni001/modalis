/**
 * Shapes the API returns, with bigints as decimal strings.
 *
 * Every monetary field crosses the wire as a string and is revived with BigInt() — never with
 * Number(), which would silently lose precision above 2^53.
 */
export type ApiPosition = {
  token: string;
  symbol: string;
  decimals: number;
  isLiquid: boolean;
  assetMaxBps: number;
  targetBps: number;
  minBps: number;
  maxBps: number;
  amount: string;
  priceE18: string;
  valueE18: string;
  allocationBps: number;
  driftBps: number;
};

export type ApiMandate = {
  targetValue: string;
  targetDate: number;
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
  active: boolean;
  version: number;
};

export type ApiPortfolioState = {
  owner: string;
  mandate: ApiMandate;
  positions: ApiPosition[];
  totalValueE18: string;
  liquidityBps: number;
  blockNumber: string;
  hasMandate: boolean;
};

export type ApiViolation = {
  code: "MAX_ALLOCATION_EXCEEDED" | "ALLOCATION_ABOVE_RANGE" | "ALLOCATION_BELOW_MIN" | "MIN_LIQUIDITY_BREACHED";
  token?: string;
  bps: number;
  limitBps: number;
};

export type ApiRisk = {
  status: "OK" | "DRIFT" | "BREACH";
  maxDriftBps: number;
  liquidityBps: number;
  largestPositionBps: number;
  violations: ApiViolation[];
};

export type ApiPortfolioResponse = {
  owner: string;
  hasMandate: boolean;
  state: ApiPortfolioState | null;
  risk: ApiRisk | null;
  manager?: string;
  riskSummary?: string;
  agreesWithExecutor?: boolean;
  error?: string;
};

export type ApiProposal = {
  proposal: {
    owner: string;
    adapter: string;
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    minAmountOut: string;
    deadline: string;
    mandateVersion: number;
    nonce: string;
    reasonHash: string;
  };
  reason: string;
  explanation: string;
  adapterData: string;
  expectedAmountOut: string;
  venue: { name: string; reason: string; isDemoVenue: boolean };
  simulation:
    | { ok: true; amountOut: string }
    | { ok: false; errorName: string; explanation: string; raw: string };
};

export type ApiRiskResponse = {
  kind: "no_mandate" | "empty_portfolio" | "within_mandate" | "action_needed";
  owner: string;
  risk?: ApiRisk;
  unplannable?: string | null;
  proposal: ApiProposal | null;
  error?: string;
};

export type ApiStatus = {
  chainId: number;
  networkName: string;
  rpcReachable: boolean;
  blockNumber?: string | null;
  deployed: boolean;
  contracts?: Record<string, string>;
  tokens?: Record<string, string>;
  integrations?: Record<string, boolean>;
  executionVenue?: { name: string; isDemoVenue: boolean } | null;
  managerConfigured?: boolean;
  managerAddress?: string | null;
  demoMode?: boolean;
  error?: string;
};

export const riskTone = (status?: string): "ok" | "warn" | "breach" | "default" =>
  status === "OK" ? "ok" : status === "DRIFT" ? "warn" : status === "BREACH" ? "breach" : "default";

export const riskLabel = (status?: string): string =>
  status === "OK"
    ? "Within mandate"
    : status === "DRIFT"
      ? "Drifting"
      : status === "BREACH"
        ? "Outside mandate"
        : "Unknown";
