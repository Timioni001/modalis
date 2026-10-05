/**
 * A fake Monad, for testing the domain layer without a node.
 *
 * It answers the same contract reads the real one does, from an in-memory portfolio, so the
 * services under test run their real code paths — the translation, the funding maths, the rule
 * checks — rather than a stubbed version of them.
 *
 * What it deliberately does NOT fake is enforcement. Whether a given adjustment is permitted is
 * decided by PortfolioMandate in Solidity, and that is tested where it belongs, against a real
 * EVM (contracts/test and scripts/demo-local.sh). Faking a "yes" here would be testing the mock.
 */
import type { Address, PublicClient } from "viem";
import { encodeErrorResult, getAddress } from "viem";
import { PortfolioMandateAbi, type Deployment } from "@modalis/chain";

export const CONTRACTS = {
  portfolioMandate: "0x1000000000000000000000000000000000000001",
  portfolioVault: "0x1000000000000000000000000000000000000002",
  assetRegistry: "0x1000000000000000000000000000000000000003",
  rebalanceExecutor: "0x1000000000000000000000000000000000000004",
  executionAdapter: "0x1000000000000000000000000000000000000005",
} as const;

export const TOKENS = {
  mUSD: "0x2000000000000000000000000000000000000001",
  mBTC: "0x2000000000000000000000000000000000000002",
  mETH: "0x2000000000000000000000000000000000000003",
} as const;

export const OWNER = "0x3000000000000000000000000000000000000001" as Address;
export const SOMEONE_ELSE = "0x3000000000000000000000000000000000000002" as Address;
export const MANAGER = "0x4000000000000000000000000000000000000001" as Address;

export const deployment: Deployment = {
  chainId: 31337,
  contracts: CONTRACTS as unknown as Record<string, Address>,
  tokens: TOKENS as unknown as Record<string, Address>,
};

type AssetSpec = {
  token: Address;
  symbol: string;
  decimals: number;
  isLiquid: boolean;
  /** USD per whole token, 1e18. */
  priceE18: bigint;
  maxBps: number;
  enabled: boolean;
};

type AllocationSpec = { token: Address; targetBps: number; minBps: number; maxBps: number };

export type FakeChainSpec = {
  /** Omit for someone who has never made a plan. */
  mandate?: {
    targetValueE18: bigint;
    targetDate: number;
    maxDrawdownBps: number;
    minLiquidityBps: number;
    rebalanceThresholdBps: number;
    maxSingleAssetBps: number;
    maxSlippageBps: number;
    active: boolean;
    version: number;
  };
  allocations?: AllocationSpec[];
  assets?: AssetSpec[];
  /** Base units held inside the vault, per token. */
  vault?: Record<string, bigint>;
  /** Base units held in the person's own account, per token. */
  wallet?: Record<string, bigint>;
  /** Base units the vault is allowed to move, per token. */
  allowances?: Record<string, bigint>;
  manager?: Address;
  blockNumber?: bigint;
  /**
   * How the rules answer when an adjustment is simulated against them.
   *
   * "allows" means the simulation returns cleanly. A string is the name of a real
   * PortfolioMandate error, ABI-encoded exactly as the chain would return it, so the production
   * decode path is what reads it.
   */
  rulesAnswer?: "allows" | RuleRefusal;
};

const e18 = (n: number | string) => BigInt(Math.round(Number(n) * 1e6)) * 10n ** 12n;

export const DEFAULT_ASSETS: AssetSpec[] = [
  { token: TOKENS.mUSD as Address, symbol: "mUSD", decimals: 6, isLiquid: true, priceE18: e18(1), maxBps: 10_000, enabled: true },
  { token: TOKENS.mBTC as Address, symbol: "mBTC", decimals: 8, isLiquid: false, priceE18: e18(50_000), maxBps: 6_000, enabled: true },
  { token: TOKENS.mETH as Address, symbol: "mETH", decimals: 18, isLiquid: false, priceE18: e18(2_500), maxBps: 6_000, enabled: true },
];

/** A plan that is exactly on target: 40% available cash, 35% Bitcoin, 25% Ethereum. */
export function onPlan(): FakeChainSpec {
  return {
    mandate: {
      targetValueE18: e18(20_000),
      targetDate: Math.floor(Date.now() / 1000) + 60 * 86_400 * 30,
      maxDrawdownBps: 1_500,
      minLiquidityBps: 3_000,
      rebalanceThresholdBps: 500,
      maxSingleAssetBps: 4_000,
      maxSlippageBps: 200,
      active: true,
      version: 1,
    },
    allocations: [
      { token: TOKENS.mUSD as Address, targetBps: 4_000, minBps: 3_000, maxBps: 5_000 },
      { token: TOKENS.mBTC as Address, targetBps: 3_500, minBps: 2_500, maxBps: 4_000 },
      { token: TOKENS.mETH as Address, targetBps: 2_500, minBps: 1_500, maxBps: 3_500 },
    ],
    assets: DEFAULT_ASSETS,
    // $4,000 cash + 0.07 BTC at $50,000 + 1 ETH at $2,500 = exactly $10,000, split 40/35/25.
    vault: {
      [TOKENS.mUSD]: 4_000n * 10n ** 6n,
      [TOKENS.mBTC]: 7_000_000n,
      [TOKENS.mETH]: 10n ** 18n,
    },
    wallet: {
      [TOKENS.mUSD]: 50_000n * 10n ** 6n,
      [TOKENS.mBTC]: 10n ** 8n,
      [TOKENS.mETH]: 100n * 10n ** 18n,
    },
    allowances: {},
    manager: MANAGER,
    blockNumber: 1_234n,
  };
}

/** The same plan after Bitcoin ran: it is now past the "maximum in one investment" limit. */
export function offPlan(): FakeChainSpec {
  const spec = onPlan();
  spec.vault = {
    ...spec.vault,
    // Bitcoin doubles to $7,000, taking it to ~52% of the portfolio against a 40% limit.
    [TOKENS.mBTC]: 14_000_000n,
  };
  return spec;
}

/** Signed in, no plan ever approved. */
export function noPlan(): FakeChainSpec {
  return { assets: DEFAULT_ASSETS, blockNumber: 1n };
}

const EMPTY_MANDATE = {
  targetValue: 0n,
  targetDate: 0n,
  maxDrawdownBps: 0,
  minLiquidityBps: 0,
  rebalanceThresholdBps: 0,
  maxSingleAssetBps: 0,
  maxSlippageBps: 0,
  active: false,
  version: 0,
};

/**
 * Builds a PublicClient stand-in.
 *
 * Reads are keyed on the function name the service asked for, which is why the services' real
 * read paths are exercised: a service that asked for the wrong thing gets an error, not a
 * convenient default.
 */
export function fakeClient(spec: FakeChainSpec, owner: Address = OWNER): PublicClient {
  const assets = spec.assets ?? DEFAULT_ASSETS;
  const assetOf = (token: string) => {
    const found = assets.find((a) => a.token.toLowerCase() === token.toLowerCase());
    if (!found) throw new Error(`fake chain: unknown asset ${token}`);
    return found;
  };
  const amountIn = (record: Record<string, bigint> | undefined, token: string): bigint => {
    if (!record) return 0n;
    const key = Object.keys(record).find((k) => k.toLowerCase() === token.toLowerCase());
    return key ? record[key] : 0n;
  };

  const client = {
    async getBlockNumber() {
      return spec.blockNumber ?? 1n;
    },
    async getBlock() {
      return { number: spec.blockNumber ?? 1n, timestamp: BigInt(Math.floor(Date.now() / 1000)) };
    },
    /**
     * How the rules answer. A refusal is thrown with the same ABI-encoded error data the chain
     * returns, so what reads it here is the production decoder, not a test shortcut.
     */
    async simulateContract() {
      const answer = spec.rulesAnswer ?? "allows";
      if (answer === "allows") return { result: 1n };
      const error = new Error(`execution reverted: ${answer}`) as Error & { data: string };
      error.data = refusalData(answer);
      throw error;
    },
    async readContract({
      address,
      functionName,
      args = [],
    }: {
      address: Address;
      functionName: string;
      args?: readonly unknown[];
    }) {
      const to = address.toLowerCase();

      if (to === CONTRACTS.portfolioMandate.toLowerCase()) {
        switch (functionName) {
          case "mandateOf": {
            if (!isOwner(args[0]) || !spec.mandate) return EMPTY_MANDATE;
            const m = spec.mandate;
            return {
              targetValue: m.targetValueE18,
              targetDate: BigInt(m.targetDate),
              maxDrawdownBps: m.maxDrawdownBps,
              minLiquidityBps: m.minLiquidityBps,
              rebalanceThresholdBps: m.rebalanceThresholdBps,
              maxSingleAssetBps: m.maxSingleAssetBps,
              maxSlippageBps: m.maxSlippageBps,
              active: m.active,
              version: m.version,
            };
          }
          case "allocationsOf":
            return isOwner(args[0]) ? (spec.allocations ?? []) : [];
          case "managerOf":
            return isOwner(args[0])
              ? (spec.manager ?? "0x0000000000000000000000000000000000000000")
              : "0x0000000000000000000000000000000000000000";
        }
      }

      if (to === CONTRACTS.assetRegistry.toLowerCase()) {
        switch (functionName) {
          case "listAssets":
            return assets.filter((a) => a.enabled).map((a) => a.token);
          case "getAsset": {
            const asset = assetOf(String(args[0]));
            return {
              token: asset.token,
              oracle: "0x5000000000000000000000000000000000000001",
              maxBps: asset.maxBps,
              decimals: asset.decimals,
              enabled: asset.enabled,
              isLiquid: asset.isLiquid,
              symbol: asset.symbol,
            };
          }
          case "value": {
            const asset = assetOf(String(args[0]));
            const amount = BigInt(String(args[1]));
            return (amount * asset.priceE18) / 10n ** BigInt(asset.decimals);
          }
        }
      }

      if (to === CONTRACTS.portfolioVault.toLowerCase() && functionName === "balanceOf") {
        return isOwner(args[0]) ? amountIn(spec.vault, String(args[1])) : 0n;
      }

      if (to === CONTRACTS.rebalanceExecutor.toLowerCase()) {
        if (functionName === "nextNonce") return 0n;
      }

      if (to === CONTRACTS.assetRegistry.toLowerCase() && functionName === "convert") {
        const from = assetOf(String(args[0]));
        const into = assetOf(String(args[1]));
        const amount = BigInt(String(args[2]));
        const usd = (amount * from.priceE18) / 10n ** BigInt(from.decimals);
        return (usd * 10n ** BigInt(into.decimals)) / into.priceE18;
      }

      // ERC-20 reads go straight to the token.
      const asset = assets.find((a) => a.token.toLowerCase() === to);
      if (asset) {
        if (functionName === "balanceOf") {
          return isOwner(args[0]) ? amountIn(spec.wallet, asset.token) : 0n;
        }
        if (functionName === "allowance") {
          return isOwner(args[0]) ? amountIn(spec.allowances, asset.token) : 0n;
        }
        if (functionName === "decimals") return asset.decimals;
      }

      throw new Error(`fake chain: unexpected read ${functionName} at ${address}`);
    },
  };

  function isOwner(value: unknown): boolean {
    return typeof value === "string" && getAddress(value) === getAddress(owner);
  }

  return client as unknown as PublicClient;
}

/** A DomainContext over the fake chain. No database and no AI: both are optional by design. */
export function fakeContext(spec: FakeChainSpec, owner: Address = OWNER) {
  return {
    client: fakeClient(spec, owner),
    deployment,
    db: null,
    explorerUrl: "https://explorer.example/",
    rpcUrl: "http://127.0.0.1:8545",
    ai: {},
    managerAddress: MANAGER,
  };
}

/**
 * How a mandate refusal looks on the wire.
 *
 * Encoded against the real PortfolioMandate ABI with arguments of the right shape, so what reads
 * it in the services under test is the production decoder.
 */
export type RuleRefusal =
  | "MAX_ALLOCATION_EXCEEDED"
  | "MIN_LIQUIDITY_BREACHED"
  | "ALLOCATION_ABOVE_RANGE"
  | "ALLOCATION_BELOW_MIN";

function refusalData(refusal: RuleRefusal): `0x${string}` {
  const token = TOKENS.mBTC as Address;
  switch (refusal) {
    case "MIN_LIQUIDITY_BREACHED":
      return encodeErrorResult({
        abi: PortfolioMandateAbi,
        errorName: "MIN_LIQUIDITY_BREACHED",
        args: [2_100n, 3_000n],
      });
    case "ALLOCATION_ABOVE_RANGE":
      return encodeErrorResult({
        abi: PortfolioMandateAbi,
        errorName: "ALLOCATION_ABOVE_RANGE",
        args: [token, 5_200n, 4_000n],
      });
    case "ALLOCATION_BELOW_MIN":
      return encodeErrorResult({
        abi: PortfolioMandateAbi,
        errorName: "ALLOCATION_BELOW_MIN",
        args: [token, 1_200n, 2_500n],
      });
    case "MAX_ALLOCATION_EXCEEDED":
      return encodeErrorResult({
        abi: PortfolioMandateAbi,
        errorName: "MAX_ALLOCATION_EXCEEDED",
        args: [token, 5_200n, 4_000n],
      });
  }
}
