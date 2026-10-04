/**
 * Rebalance proposals: build -> simulate -> submit.
 *
 * A proposal is the structured action the intelligence layer produces. It is NOT trusted:
 * RebalanceExecutor re-checks authorisation, mandate version, deadline, nonce, slippage floor,
 * venue approval and post-trade mandate compliance, and reverts the whole transaction otherwise.
 *
 * We simulate before sending for two reasons: it avoids burning gas on a doomed proposal, and it
 * surfaces the exact custom error (e.g. MAX_ALLOCATION_EXCEEDED) that the UI shows the user.
 */
import {
  decodeErrorResult,
  encodeAbiParameters,
  keccak256,
  toHex,
  type Address,
  type Hex,
  type PublicClient,
  type WalletClient,
} from "viem";
import { AssetRegistryAbi, PortfolioMandateAbi, RebalanceExecutorAbi } from "./abis/index.ts";
import { requireContract, type Deployment } from "./addresses.ts";
import { readNextNonce } from "./portfolio.ts";

const BPS = 10_000n;

export type Proposal = {
  owner: Address;
  adapter: Address;
  tokenIn: Address;
  tokenOut: Address;
  amountIn: bigint;
  minAmountOut: bigint;
  deadline: bigint;
  mandateVersion: number;
  nonce: bigint;
  reasonHash: Hex;
};

export type BuildProposalInput = {
  owner: Address;
  adapter: Address;
  tokenIn: Address;
  tokenOut: Address;
  /** Amount of tokenIn to sell, in base units. */
  amountIn: bigint;
  /** Plain-language explanation shown to the user; hashed on-chain for auditability. */
  reason: string;
  /** Seconds the proposal stays valid. Short by design: stale proposals must expire. */
  ttlSeconds?: number;
  /**
   * Slippage the caller is willing to accept, in bps. Must not exceed the mandate's
   * maxSlippageBps, which the executor enforces. Defaults to the mandate ceiling, the loosest
   * value the mandate permits; pass a smaller number to demand a tighter fill.
   */
  slippageToleranceBps?: number;
};

export type BuiltProposal = {
  proposal: Proposal;
  reason: string;
  /** Oracle-implied output for amountIn, before slippage. */
  expectedAmountOut: bigint;
  /** The lowest minAmountOut the mandate allows; the executor rejects anything looser. */
  mandateFloorAmountOut: bigint;
};

export function hashReason(reason: string): Hex {
  return keccak256(toHex(reason));
}

/** Converts a USD amount (1e18) into base units of `token` at the registry's oracle price. */
export async function usdToTokenAmount(
  client: PublicClient,
  deployment: Deployment,
  token: Address,
  usdE18: bigint,
  decimals: number,
): Promise<bigint> {
  const unit = 10n ** BigInt(decimals);
  const priceE18 = (await client.readContract({
    address: requireContract(deployment, "assetRegistry"),
    abi: AssetRegistryAbi,
    functionName: "value",
    args: [token, unit],
  })) as bigint;
  if (priceE18 === 0n) throw new Error(`Oracle returned a zero price for ${token}`);
  return (usdE18 * unit) / priceE18;
}

/**
 * Builds a proposal whose nonce, mandate version and slippage floor are read from the chain,
 * so it is valid against live state rather than against whatever the planner last saw.
 */
export async function buildProposal(
  client: PublicClient,
  deployment: Deployment,
  input: BuildProposalInput,
): Promise<BuiltProposal> {
  const mandateAddr = requireContract(deployment, "portfolioMandate");
  const registryAddr = requireContract(deployment, "assetRegistry");

  const [mandate, nonce, expectedAmountOut, block] = await Promise.all([
    client.readContract({
      address: mandateAddr,
      abi: PortfolioMandateAbi,
      functionName: "mandateOf",
      args: [input.owner],
    }) as Promise<{ version: number; maxSlippageBps: number; active: boolean }>,
    readNextNonce(client, deployment, input.owner),
    client.readContract({
      address: registryAddr,
      abi: AssetRegistryAbi,
      functionName: "convert",
      args: [input.tokenIn, input.tokenOut, input.amountIn],
    }) as Promise<bigint>,
    client.getBlock(),
  ]);

  if (Number(mandate.version) === 0) throw new Error(`${input.owner} has no mandate on chain ${deployment.chainId}`);

  const maxSlippageBps = BigInt(mandate.maxSlippageBps);
  const mandateFloorAmountOut = (expectedAmountOut * (BPS - maxSlippageBps)) / BPS;

  const tolerance = input.slippageToleranceBps === undefined ? maxSlippageBps : BigInt(input.slippageToleranceBps);
  if (tolerance > maxSlippageBps) {
    throw new Error(
      `slippageToleranceBps ${input.slippageToleranceBps} exceeds the mandate's ${mandate.maxSlippageBps} bps ceiling`,
    );
  }
  // A smaller tolerance means a HIGHER minAmountOut, so this can only ever sit at or above the
  // mandate floor the executor checks against.
  const minAmountOut = (expectedAmountOut * (BPS - tolerance)) / BPS;

  const ttl = BigInt(input.ttlSeconds ?? 300);

  return {
    proposal: {
      owner: input.owner,
      adapter: input.adapter,
      tokenIn: input.tokenIn,
      tokenOut: input.tokenOut,
      amountIn: input.amountIn,
      minAmountOut,
      deadline: block.timestamp + ttl,
      mandateVersion: Number(mandate.version),
      nonce,
      reasonHash: hashReason(input.reason),
    },
    reason: input.reason,
    expectedAmountOut,
    mandateFloorAmountOut,
  };
}

export type SimulationResult =
  | { ok: true; amountOut: bigint }
  | { ok: false; errorName: string; args: readonly unknown[]; raw: string };

/**
 * Dry-runs the proposal against live chain state. A failure here is the contract refusing the
 * action: that is the security boundary doing its job, and the error name is what we show.
 */
export async function simulateProposal(
  client: PublicClient,
  deployment: Deployment,
  proposal: Proposal,
  adapterData: Hex,
  caller: Address,
): Promise<SimulationResult> {
  try {
    const { result } = await client.simulateContract({
      address: requireContract(deployment, "rebalanceExecutor"),
      abi: RebalanceExecutorAbi,
      functionName: "execute",
      args: [proposal, adapterData],
      account: caller,
    });
    return { ok: true, amountOut: result as bigint };
  } catch (err) {
    return { ok: false, ...decodeRevert(err) };
  }
}

/** Submits the proposal. Returns the real transaction hash; never synthesise one. */
export async function submitProposal(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  proposal: Proposal,
  adapterData: Hex,
): Promise<{ hash: Hex }> {
  const account = wallet.account;
  if (!account) throw new Error("Wallet client has no account");
  const hash = await wallet.writeContract({
    address: requireContract(deployment, "rebalanceExecutor"),
    abi: RebalanceExecutorAbi,
    functionName: "execute",
    args: [proposal, adapterData],
    account,
    chain: wallet.chain,
  });
  return { hash };
}

/**
 * Pulls the custom error out of a revert so "MAX_ALLOCATION_EXCEEDED" can be shown verbatim
 * rather than a generic failure.
 */
export function decodeRevert(err: unknown): { errorName: string; args: readonly unknown[]; raw: string } {
  const raw = err instanceof Error ? err.message : String(err);
  const data = findRevertData(err);
  if (data) {
    for (const abi of [RebalanceExecutorAbi, PortfolioMandateAbi, AssetRegistryAbi]) {
      try {
        const decoded = decodeErrorResult({ abi, data });
        return { errorName: decoded.errorName, args: decoded.args ?? [], raw };
      } catch {
        // try the next ABI
      }
    }
  }
  const named = /([A-Z][A-Z0-9_]{3,})\s*\(/.exec(raw);
  return { errorName: named?.[1] ?? "UNKNOWN_REVERT", args: [], raw };
}

function findRevertData(err: unknown): Hex | undefined {
  let cur: unknown = err;
  for (let i = 0; i < 12 && cur; i++) {
    const o = cur as Record<string, unknown>;
    const d = o.data;
    if (typeof d === "string" && d.startsWith("0x") && d.length >= 10) return d as Hex;
    if (d && typeof d === "object") {
      const inner = (d as Record<string, unknown>).data;
      if (typeof inner === "string" && inner.startsWith("0x") && inner.length >= 10) return inner as Hex;
    }
    cur = o.cause;
  }
  return undefined;
}

/** Mock/whole-portfolio adapters need no route data; Kuru encodes its route here. */
export const EMPTY_ADAPTER_DATA: Hex = "0x";

export function encodeKuruRoute(route: {
  marketAddresses: readonly Address[];
  isBuy: readonly boolean[];
  nativeSend: readonly boolean[];
}): Hex {
  return encodeAbiParameters(
    [{ type: "address[]" }, { type: "bool[]" }, { type: "bool[]" }],
    [route.marketAddresses as Address[], route.isBuy as boolean[], route.nativeSend as boolean[]],
  );
}
