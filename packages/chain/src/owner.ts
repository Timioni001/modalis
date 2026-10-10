/**
 * Owner-signed writes. These are the actions only the portfolio owner can take, and they are
 * signed by the USER's wallet (Dynamic embedded or external) — never by a backend key.
 *
 * The manager key used by services/risk-monitor cannot call any of these; PortfolioMandate keys
 * every one of them off msg.sender, so authority is enforced on-chain rather than in this file.
 */
import { encodeFunctionData, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
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

export type BatchStep = { kind: "allow" | "add"; token: Address; amount: bigint };

/**
 * Approve-and-deposit as raw calls, for wallets that can sign several in one go (EIP-5792
 * `wallet_sendCalls`). Each call is exactly what `approveToken` / `deposit` would send, so the
 * contract sees the same thing either way; only the number of signatures changes.
 */
export function fundingCalls(deployment: Deployment, steps: BatchStep[]): { to: Address; data: Hex }[] {
  const vault = requireContract(deployment, "portfolioVault");
  return steps.map((s) =>
    s.kind === "allow"
      ? { to: s.token, data: encodeFunctionData({ abi: MockERC20Abi, functionName: "approve", args: [vault, s.amount] }) }
      : { to: vault, data: encodeFunctionData({ abi: PortfolioVaultAbi, functionName: "deposit", args: [s.token, s.amount] }) },
  );
}

/**
 * True when the connected wallet says it can run a batch atomically on this chain. Wallets that
 * don't implement EIP-5792 throw on the question; that is a plain "no".
 */
export async function canBatch(wallet: WalletClient, chainId: number): Promise<boolean> {
  try {
    const account = requireAccount(wallet);
    const caps = (await wallet.getCapabilities({ account, chainId })) as Record<string, unknown>;
    const atomic = caps?.atomic as { status?: string } | undefined;
    const legacy = caps?.atomicBatch as { supported?: boolean } | undefined;
    return atomic?.status === "supported" || atomic?.status === "ready" || legacy?.supported === true;
  } catch {
    return false;
  }
}

/** Sends the calls as one batch and waits for it. Returns every transaction hash it produced. */
export async function sendBatch(
  wallet: WalletClient,
  calls: { to: Address; data: Hex }[],
): Promise<Hex[]> {
  const account = requireAccount(wallet);
  const { id } = await wallet.sendCalls({ account, chain: wallet.chain, calls, forceAtomic: true });
  const result = await wallet.waitForCallsStatus({ id, pollingInterval: 200, timeout: 90_000 });
  if (result.status !== "success") throw new Error("The batch didn't go through. Nothing moved.");
  return (result.receipts ?? []).map((r) => r.transactionHash);
}
