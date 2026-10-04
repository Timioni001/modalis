/**
 * Owner-signed writes. These are the actions only the portfolio owner can take, and they are
 * signed by the USER's wallet (Dynamic embedded or external) — never by a backend key.
 *
 * The manager key used by services/risk-monitor cannot call any of these; PortfolioMandate keys
 * every one of them off msg.sender, so authority is enforced on-chain rather than in this file.
 */
import type { Address, Hex, PublicClient, WalletClient } from "viem";
import { MockERC20Abi, PortfolioMandateAbi, PortfolioVaultAbi } from "./abis/index.ts";
import { requireContract, type Deployment } from "./addresses.ts";

export type MandateParams = {
  targetValue: bigint; // USD 1e18
  targetDate: bigint; // unix seconds
  maxDrawdownBps: number;
  minLiquidityBps: number;
  rebalanceThresholdBps: number;
  maxSingleAssetBps: number;
  maxSlippageBps: number;
};

export type AllocationInput = {
  token: Address;
  targetBps: number;
  minBps: number;
  maxBps: number;
};

function requireAccount(wallet: WalletClient) {
  if (!wallet.account) throw new Error("Wallet client has no account connected");
  return wallet.account;
}

/**
 * Creates or replaces the caller's mandate. Bumps the on-chain version, which invalidates any
 * in-flight proposal built against the old rules — that is the anti-stale guarantee.
 */
export async function setMandate(
  wallet: WalletClient,
  deployment: Deployment,
  params: MandateParams,
  allocations: AllocationInput[],
): Promise<Hex> {
  assertAllocationsSumTo100(allocations);
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioMandate"),
    abi: PortfolioMandateAbi,
    functionName: "setMandate",
    args: [params, allocations],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

/**
 * Authorises the Modalis manager to submit rebalance proposals. This grants proposal rights only:
 * the manager can never withdraw funds or edit the mandate.
 */
export async function setManager(
  wallet: WalletClient,
  deployment: Deployment,
  manager: Address,
): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioMandate"),
    abi: PortfolioMandateAbi,
    functionName: "setManager",
    args: [manager],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

export async function setMandateActive(
  wallet: WalletClient,
  deployment: Deployment,
  active: boolean,
): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioMandate"),
    abi: PortfolioMandateAbi,
    functionName: "setActive",
    args: [active],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

/** ERC-20 approval for the vault. Separate call so the UI can show it as its own step. */
export async function approveToken(
  wallet: WalletClient,
  deployment: Deployment,
  token: Address,
  amount: bigint,
): Promise<Hex> {
  return wallet.writeContract({
    address: token,
    abi: MockERC20Abi,
    functionName: "approve",
    args: [requireContract(deployment, "portfolioVault"), amount],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

export async function readAllowance(
  client: PublicClient,
  deployment: Deployment,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: MockERC20Abi,
    functionName: "allowance",
    args: [owner, requireContract(deployment, "portfolioVault")],
  })) as bigint;
}

export async function readTokenBalance(
  client: PublicClient,
  token: Address,
  owner: Address,
): Promise<bigint> {
  return (await client.readContract({
    address: token,
    abi: MockERC20Abi,
    functionName: "balanceOf",
    args: [owner],
  })) as bigint;
}

export async function deposit(
  wallet: WalletClient,
  deployment: Deployment,
  token: Address,
  amount: bigint,
): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioVault"),
    abi: PortfolioVaultAbi,
    functionName: "deposit",
    args: [token, amount],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

/** Owner-only, and deliberately still available while the vault is paused. */
export async function withdraw(
  wallet: WalletClient,
  deployment: Deployment,
  token: Address,
  amount: bigint,
): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioVault"),
    abi: PortfolioVaultAbi,
    functionName: "withdraw",
    args: [token, amount],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

export async function emergencyWithdraw(wallet: WalletClient, deployment: Deployment): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "portfolioVault"),
    abi: PortfolioVaultAbi,
    functionName: "emergencyWithdraw",
    args: [],
    account: requireAccount(wallet),
    chain: wallet.chain,
  });
}

/**
 * Mirrors the contract's own precondition so the UI can reject an impossible mandate before
 * asking the user to sign. The contract re-checks it regardless.
 */
export function assertAllocationsSumTo100(allocations: AllocationInput[]): void {
  if (allocations.length === 0) throw new Error("A mandate needs at least one allocation");
  const sum = allocations.reduce((acc, a) => acc + a.targetBps, 0);
  if (sum !== 10_000) {
    throw new Error(`Allocation targets must sum to 10000 bps (100%); got ${sum}`);
  }
  for (const a of allocations) {
    if (!(a.minBps <= a.targetBps && a.targetBps <= a.maxBps)) {
      throw new Error(`Invalid range for ${a.token}: need minBps <= targetBps <= maxBps`);
    }
  }
}
