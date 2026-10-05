/**
 * Money: what the person has, and putting more in.
 *
 * The funding flow is split deliberately. The SERVER works out what should happen — it reads the
 * plan's targets and live prices, converts a dollar amount into units of each investment, and
 * checks the person actually holds enough. The PERSON'S OWN WALLET signs each step, because
 * putting money in is an owner action and no server key may do it on their behalf.
 *
 * That is also why the server never holds a user key: the worst a compromised Modalis server
 * could do is suggest a bad funding plan, which the person would have to sign.
 */
import {
  AssetRegistryAbi,
  MockERC20Abi,
  readAllowance,
  readPortfolio,
  readTokenBalance,
  requireContract,
  usdToTokenAmount,
  type Deployment,
  type PortfolioState,
} from "@modalis/chain";
import { getAddress, type Address, type PublicClient } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import { displayName, toMoneyView, unitsToDecimal } from "../translate.ts";
import { money, moneyFromE18, type FundingPlan, type FundingStep, type MoneyView } from "../models.ts";

/** What the person currently has. Read live from the chain every time. */
export async function getMoney(ctx: DomainContext, owner: Address): Promise<MoneyView> {
  const state = await readPortfolio(ctx.client, ctx.deployment, getAddress(owner));
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "You don't have a plan yet, so there's nothing to show.", 404);
  }
  return toMoneyView(state);
}

/** USD (1e18) -> a decimal string, for building amounts without a float. */
function usdStringToE18(amount: string): bigint {
  const trimmed = amount.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    throw new DomainError("bad_amount", "Enter an amount like 500 or 500.00.");
  }
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > 18) throw new DomainError("bad_amount", "That amount is too precise.");
  return BigInt(whole) * 10n ** 18n + BigInt(frac.padEnd(18, "0"));
}

export type FundingRequest = {
  /** How much to add, in dollars, as a decimal string. */
  amount: string;
};

/**
 * Works out how to put money in, split across investments according to the plan's targets.
 *
 * Returns the steps in the order they must happen. Adding money takes two actions per
 * investment — granting permission, then the transfer — and the person sees that as progress
 * rather than as jargon.
 */
export async function buildFundingPlan(
  ctx: DomainContext,
  owner: Address,
  request: FundingRequest,
): Promise<FundingPlan> {
  const who = getAddress(owner);
  const totalE18 = usdStringToE18(request.amount);
  if (totalE18 <= 0n) {
    throw new DomainError("bad_amount", "Enter an amount greater than zero.");
  }

  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "Create and approve a plan before adding money.", 409);
  }
  if (state.positions.length === 0) {
    throw new DomainError("no_plan", "Your plan has no investments in it yet.", 409);
  }

  const steps: FundingStep[] = [];
  const shortfalls: FundingPlan["shortfalls"] = [];

  for (const position of state.positions) {
    // Split by the plan's own target shares, so new money lands the portfolio on plan.
    const shareE18 = (totalE18 * BigInt(position.targetBps)) / 10_000n;
    if (shareE18 === 0n) continue;

    const units = await usdToTokenAmount(
      ctx.client,
      ctx.deployment,
      position.token,
      shareE18,
      position.decimals,
    );
    if (units === 0n) continue;

    const [walletBalance, allowance] = await Promise.all([
      readTokenBalance(ctx.client, position.token, who),
      readAllowance(ctx.client, ctx.deployment, position.token, who),
    ]);

    const name = displayName(position.symbol);
    const unitsText = unitsToDecimal(units, position.decimals);

    if (walletBalance < units) {
      shortfalls.push({
        holdingName: name,
        needs: unitsText,
        has: unitsToDecimal(walletBalance, position.decimals),
      });
    }

    // Permission is only needed when the existing allowance does not already cover it.
    if (allowance < units) {
      steps.push({
        id: `allow:${position.token}`,
        kind: "allow",
        holdingName: name,
        holdingId: position.token,
        units: unitsText,
        rawUnits: units.toString(),
        value: moneyFromE18(shareE18),
        status: "pending",
        description: `Give Modalis permission to move ${unitsText} ${name} on your behalf.`,
      });
    }

    steps.push({
      id: `add:${position.token}`,
      kind: "add",
      holdingName: name,
      holdingId: position.token,
      units: unitsText,
      rawUnits: units.toString(),
      value: moneyFromE18(shareE18),
      status: "pending",
      description: `Add ${unitsText} ${name} to your plan.`,
    });
  }

  if (steps.length === 0) {
    throw new DomainError(
      "amount_too_small",
      "That amount is too small to spread across your plan. Try a larger amount.",
    );
  }

  return {
    total: moneyFromE18(totalE18),
    steps,
    hasShortfall: shortfalls.length > 0,
    shortfalls,
  };
}

/**
 * What the person holds in their wallet, before any of it is put into a plan.
 *
 * Needed so the funding screen can say "you don't have enough Bitcoin" before they sign anything
 * rather than after a transaction fails.
 */
export async function getWalletBalances(
  ctx: DomainContext,
  owner: Address,
): Promise<{ id: Address; name: string; code: string; units: string; value: string }[]> {
  const who = getAddress(owner);
  const registry = requireContract(ctx.deployment, "assetRegistry");

  const tokens = (await ctx.client.readContract({
    address: registry,
    abi: AssetRegistryAbi,
    functionName: "listAssets",
    args: [],
  })) as readonly Address[];

  const out: { id: Address; name: string; code: string; units: string; value: string }[] = [];
  for (const token of tokens) {
    const asset = (await ctx.client.readContract({
      address: registry,
      abi: AssetRegistryAbi,
      functionName: "getAsset",
      args: [token],
    })) as { decimals: number; symbol: string; enabled: boolean };
    if (!asset.enabled) continue;

    const balance = await readTokenBalance(ctx.client, token, who);
    if (balance === 0n) continue;

    const valueE18 = (await ctx.client.readContract({
      address: registry,
      abi: AssetRegistryAbi,
      functionName: "value",
      args: [token, balance],
    })) as bigint;

    out.push({
      id: token,
      name: displayName(asset.symbol),
      code: asset.symbol,
      units: unitsToDecimal(balance, Number(asset.decimals)),
      value: moneyFromE18(valueE18).amount,
    });
  }
  return out;
}

/**
 * Demo networks only: mints the investments a person needs so they can try the product.
 *
 * Refuses on mainnet. This exists because the demo assets are test tokens with an open mint;
 * nothing like it is possible with a real asset, and the UI must label it as a test-network
 * convenience rather than free money.
 */
export async function canMintDemoFunds(deployment: Deployment): Promise<boolean> {
  return deployment.chainId !== 143 && Boolean(deployment.tokens.mUSD);
}

export { MockERC20Abi };
export type { PortfolioState, PublicClient };
