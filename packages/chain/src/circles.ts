/**
 * Savings circles (ajo / esusu / chama): a rotating pool where each member pays the same amount
 * every round and one member takes the whole pot, in turn. See contracts/src/SavingsCircle.sol.
 *
 * Every write here is signed by the member's own wallet. The contract has no owner and no admin
 * key, so there is nothing for Modalis to sign.
 */
import { getAddress, type Address, type Hex, type PublicClient, type WalletClient } from "viem";
import { MockERC20Abi, SavingsCircleAbi } from "./abis/index.ts";
import { requireContract, type Deployment } from "./addresses.ts";

export type CircleStatus = "active" | "completed" | "stopped";

export type Circle = {
  id: bigint;
  name: string;
  token: Address;
  contribution: bigint;
  roundSeconds: number;
  roundDeadline: number;
  round: number;
  paidCount: number;
  status: CircleStatus;
  creator: Address;
  members: Address[];
  paidThisRound: boolean[];
};

const STATUS: CircleStatus[] = ["active", "completed", "stopped"];

function account(wallet: WalletClient) {
  if (!wallet.account) throw new Error("Wallet client has no account connected");
  return wallet.account;
}

/** Whose turn it is to receive this round's pot. */
export function recipientOf(c: Circle): Address {
  return c.members[Math.min(c.round, c.members.length - 1)];
}

export function potOf(c: Circle): bigint {
  return c.contribution * BigInt(c.members.length);
}

/** True when the round's deadline passed with someone unpaid: the circle can be stopped and refunded. */
export function isOverdue(c: Circle, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  return c.status === "active" && nowSeconds > c.roundDeadline;
}

export async function readCircle(client: PublicClient, deployment: Deployment, id: bigint): Promise<Circle> {
  const v = await client.readContract({
    address: requireContract(deployment, "savingsCircle"),
    abi: SavingsCircleAbi,
    functionName: "getCircle",
    args: [id],
  });
  return {
    id: v.id,
    name: v.name,
    token: getAddress(v.token),
    contribution: v.contribution,
    roundSeconds: Number(v.roundSeconds),
    roundDeadline: Number(v.roundDeadline),
    round: Number(v.round),
    paidCount: Number(v.paidCount),
    status: STATUS[Number(v.status)] ?? "active",
    creator: getAddress(v.creator),
    members: v.members.map((m) => getAddress(m)),
    paidThisRound: [...v.paidThisRound],
  };
}

/** Every circle the address belongs to, newest first. */
export async function readCirclesOf(
  client: PublicClient,
  deployment: Deployment,
  member: Address,
): Promise<Circle[]> {
  const ids = await client.readContract({
    address: requireContract(deployment, "savingsCircle"),
    abi: SavingsCircleAbi,
    functionName: "circlesOf",
    args: [member],
  });
  const circles = await Promise.all(ids.map((id) => readCircle(client, deployment, id)));
  return circles.reverse();
}

export async function createCircle(
  wallet: WalletClient,
  deployment: Deployment,
  input: { name: string; token: Address; contribution: bigint; roundSeconds: number; members: Address[] },
): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "savingsCircle"),
    abi: SavingsCircleAbi,
    functionName: "create",
    args: [input.name, input.token, input.contribution, BigInt(input.roundSeconds), input.members],
    account: account(wallet),
    chain: wallet.chain,
  });
}

/**
 * Pays this round's share. Approves the circle contract first when the allowance is short, and
 * waits for that approval so the payment never fails on it. Returns the payment's hash.
 */
export async function payIntoCircle(
  wallet: WalletClient,
  client: PublicClient,
  deployment: Deployment,
  circle: Circle,
): Promise<Hex> {
  const spender = requireContract(deployment, "savingsCircle");
  const owner = account(wallet).address;
  const allowance = await client.readContract({
    address: circle.token,
    abi: MockERC20Abi,
    functionName: "allowance",
    args: [owner, spender],
  });
  if (allowance < circle.contribution) {
    const approval = await wallet.writeContract({
      address: circle.token,
      abi: MockERC20Abi,
      functionName: "approve",
      args: [spender, circle.contribution],
      account: account(wallet),
      chain: wallet.chain,
    });
    await client.waitForTransactionReceipt({ hash: approval });
  }
  return wallet.writeContract({
    address: spender,
    abi: SavingsCircleAbi,
    functionName: "contribute",
    args: [circle.id],
    account: account(wallet),
    chain: wallet.chain,
  });
}

/** After a missed deadline: stops the circle (if nobody has yet) and returns your payment. */
export async function refundFromCircle(wallet: WalletClient, deployment: Deployment, id: bigint): Promise<Hex> {
  return wallet.writeContract({
    address: requireContract(deployment, "savingsCircle"),
    abi: SavingsCircleAbi,
    functionName: "refund",
    args: [id],
    account: account(wallet),
    chain: wallet.chain,
  });
}
