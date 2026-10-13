/**
 * Reads live portfolio state from Monad.
 *
 * This is the "CURRENT state" of the three-state model (target / current / transition). Every
 * number here comes from a contract read — balances from PortfolioVault, prices and decimals from
 * AssetRegistry's oracle, rules from PortfolioMandate. Nothing is cached or synthesised.
 */
import { formatUnits, type Address, type PublicClient } from "viem";
import {
  AssetRegistryAbi,
  PortfolioMandateAbi,
  PortfolioVaultAbi,
  RebalanceExecutorAbi,
} from "./abis/index.ts";
import { requireContract, type Deployment } from "./addresses.ts";

export type OnchainMandate = {
  targetValue: bigint; // USD 1e18
  targetDate: number; // unix seconds
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
  active: boolean;
  version: number; // 0 = no mandate set
};

export type OnchainPosition = {
  token: Address;
  symbol: string;
  decimals: number;
  isLiquid: boolean;
  /** AssetRegistry global ceiling (bps), independent of the user's mandate. */
  assetMaxBps: number;
  targetBps: number;
  minBps: number;
  maxBps: number;
  amount: bigint; // base units
  priceE18: bigint; // USD per whole token, 1e18
  valueE18: bigint; // USD 1e18
  allocationBps: number;
  driftBps: number; // allocationBps - targetBps
};

export type PortfolioState = {
  owner: Address;
  mandate: OnchainMandate;
  positions: OnchainPosition[];
  totalValueE18: bigint;
  liquidityBps: number;
  blockNumber: bigint;
  /** True when the owner has a mandate on-chain. */
  hasMandate: boolean;
};

/** Approved rules and targets, with no balance or price fields. */
export type PlanState = Pick<
  PortfolioState,
  "owner" | "mandate" | "blockNumber" | "hasMandate"
> & {
  positions: Pick<
    OnchainPosition,
    | "token"
    | "symbol"
    | "decimals"
    | "isLiquid"
    | "assetMaxBps"
    | "targetBps"
    | "minBps"
    | "maxBps"
  >[];
};

const BPS = 10_000n;

export function bpsOf(value: bigint, total: bigint): number {
  if (total === 0n) return 0;
  return Number((value * BPS) / total);
}

/** USD (1e18) as a display string, e.g. 2840.21 -> "2,840.21". */
export function formatUsd(valueE18: bigint, fractionDigits = 2): string {
  const n = Number(formatUnits(valueE18, 18));
  return n.toLocaleString("en-US", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  });
}

/** Rules and target allocations do not depend on prices. Never use this result as a balance. */
export async function readPlanState(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<PlanState> {
  const state = await readState(client, deployment, owner, false);
  return {
    owner: state.owner,
    mandate: state.mandate,
    blockNumber: state.blockNumber,
    hasMandate: state.hasMandate,
    positions: state.positions.map(
      ({
        token,
        symbol,
        decimals,
        isLiquid,
        assetMaxBps,
        targetBps,
        minBps,
        maxBps,
      }) => ({
        token,
        symbol,
        decimals,
        isLiquid,
        assetMaxBps,
        targetBps,
        minBps,
        maxBps,
      }),
    ),
  };
}

/** Exact token quantities can be read without an oracle. No zero or stale valuation is returned. */
export async function readAssetBalances(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
) {
  const state = await readState(client, deployment, owner, false);
  const balances = await Promise.all(
    state.positions.map((position) =>
      client.readContract({
        address: requireContract(deployment, "portfolioVault"),
        abi: PortfolioVaultAbi,
        functionName: "balanceOf",
        args: [state.owner, position.token],
      }),
    ),
  );
  return {
    hasMandate: state.hasMandate,
    holdings: state.positions.map((position, index) => ({
      token: position.token,
      symbol: position.symbol,
      units: formatUnits(balances[index], position.decimals),
    })),
  };
}

/** Live, priced balances for the dashboard and monitor. Never substitutes expired quotes. */
export async function readPortfolio(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<PortfolioState> {
  return readState(client, deployment, owner, true);
}

async function readState(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
  includeValuation: boolean,
): Promise<PortfolioState> {
  const mandateAddr = requireContract(deployment, "portfolioMandate");
  const registryAddr = requireContract(deployment, "assetRegistry");
  const vaultAddr = requireContract(deployment, "portfolioVault");

  const [blockNumber, rawMandate, allocations] = await Promise.all([
    client.getBlockNumber(),
    client.readContract({
      address: mandateAddr,
      abi: PortfolioMandateAbi,
      functionName: "mandateOf",
      args: [owner],
    }) as Promise<OnchainMandateRaw>,
    client.readContract({
      address: mandateAddr,
      abi: PortfolioMandateAbi,
      functionName: "allocationsOf",
      args: [owner],
    }) as Promise<readonly AllocationRaw[]>,
  ]);

  const mandate = normaliseMandate(rawMandate);

  if (mandate.version === 0 || allocations.length === 0) {
    return {
      owner,
      mandate,
      positions: [],
      totalValueE18: 0n,
      liquidityBps: 0,
      blockNumber,
      hasMandate: mandate.version > 0,
    };
  }

  // Asset metadata + balances, batched by the client's multicall.
  const assets = await Promise.all(
    allocations.map(
      (a) =>
        client.readContract({
          address: registryAddr,
          abi: AssetRegistryAbi,
          functionName: "getAsset",
          args: [a.token],
        }) as Promise<AssetRaw>,
    ),
  );
  const balances = includeValuation
    ? await Promise.all(
        allocations.map(
          (a) =>
            client.readContract({
              address: vaultAddr,
              abi: PortfolioVaultAbi,
              functionName: "balanceOf",
              args: [owner, a.token],
            }) as Promise<bigint>,
        ),
      )
    : allocations.map(() => 0n);
  // Values come from the registry so the app values the portfolio exactly as the contract does.
  const values = includeValuation
    ? await Promise.all(
        allocations.map(
          (a, i) =>
            client.readContract({
              address: registryAddr,
              abi: AssetRegistryAbi,
              functionName: "value",
              args: [a.token, balances[i]],
            }) as Promise<bigint>,
        ),
      )
    : allocations.map(() => 0n);
  const prices = includeValuation
    ? await Promise.all(
        allocations.map(
          (a, i) =>
            client.readContract({
              address: registryAddr,
              abi: AssetRegistryAbi,
              functionName: "value",
              args: [a.token, 10n ** BigInt(assets[i].decimals)],
            }) as Promise<bigint>,
        ),
      )
    : allocations.map(() => 0n);

  const totalValueE18 = values.reduce((acc, v) => acc + v, 0n);

  const positions: OnchainPosition[] = allocations.map((a, i) => {
    const allocationBps = bpsOf(values[i], totalValueE18);
    return {
      token: a.token,
      symbol: assets[i].symbol,
      decimals: assets[i].decimals,
      isLiquid: assets[i].isLiquid,
      assetMaxBps: assets[i].maxBps,
      targetBps: a.targetBps,
      minBps: a.minBps,
      maxBps: a.maxBps,
      amount: balances[i],
      priceE18: prices[i],
      valueE18: values[i],
      allocationBps,
      driftBps: allocationBps - a.targetBps,
    };
  });

  const liquidValue = positions.reduce(
    (acc, p) => (p.isLiquid ? acc + p.valueE18 : acc),
    0n,
  );

  return {
    owner,
    mandate,
    positions,
    totalValueE18,
    liquidityBps: bpsOf(liquidValue, totalValueE18),
    blockNumber,
    hasMandate: true,
  };
}

/**
 * The executor's own view of the portfolio, in the exact order and units
 * PortfolioMandate.validate() consumes. Used to cross-check our read path against the chain's.
 */
export async function readExecutorPortfolioState(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<{
  tokens: readonly Address[];
  values: readonly bigint[];
  total: bigint;
}> {
  const [tokens, values, total] = (await client.readContract({
    address: requireContract(deployment, "rebalanceExecutor"),
    abi: RebalanceExecutorAbi,
    functionName: "portfolioState",
    args: [owner],
  })) as [readonly Address[], readonly bigint[], bigint];
  return { tokens, values, total };
}

export async function readNextNonce(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: requireContract(deployment, "rebalanceExecutor"),
    abi: RebalanceExecutorAbi,
    functionName: "nextNonce",
    args: [owner],
  })) as bigint;
}

export async function readManager(
  client: PublicClient,
  deployment: Deployment,
  owner: Address,
): Promise<Address> {
  return (await client.readContract({
    address: requireContract(deployment, "portfolioMandate"),
    abi: PortfolioMandateAbi,
    functionName: "managerOf",
    args: [owner],
  })) as Address;
}

// ------------------------------------------------------------------ internals

type OnchainMandateRaw = {
  targetValue: bigint;
  targetDate: bigint;
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
  active: boolean;
  version: number;
};

type AllocationRaw = {
  token: Address;
  targetBps: number;
  minBps: number;
  maxBps: number;
};

type AssetRaw = {
  token: Address;
  oracle: Address;
  maxBps: number;
  decimals: number;
  enabled: boolean;
  isLiquid: boolean;
  symbol: string;
};

function normaliseMandate(m: OnchainMandateRaw): OnchainMandate {
  return {
    targetValue: m.targetValue,
    targetDate: Number(m.targetDate),
    maxDrawdownBps: Number(m.maxDrawdownBps),
    minLiquidityBps: Number(m.minLiquidityBps),
    rebalanceThresholdBps: Number(m.rebalanceThresholdBps),
    maxSingleAssetBps: Number(m.maxSingleAssetBps),
    maxSlippageBps: Number(m.maxSlippageBps),
    active: m.active,
    version: Number(m.version),
  };
}
