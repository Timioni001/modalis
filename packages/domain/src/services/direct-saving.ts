import {
  AssetRegistryAbi,
  PortfolioVaultAbi,
  readAllowance,
  readTokenBalance,
  requireToken,
} from "@modalis/chain";
import { getAddress, parseUnits, type Address } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import { getPlan } from "./plans.ts";
import { meetsMinimumContribution } from "../savings-preferences.ts";
import { retrievalReminderAt } from "../savings-preferences.ts";

/** Consumer saving by exact token quantity. No valuation, oracle bypass or server signing. */
export async function prepareDirectSaving(
  ctx: DomainContext,
  owner: Address,
  amount: string,
) {
  if (ctx.deployment.chainId !== 10143)
    throw new DomainError(
      "demo_only",
      "Direct demo saving is available only on the demo test network.",
      403,
    );
  if (
    !/^\d{1,9}(\.\d{1,2})?$/.test(amount) ||
    Number(amount) <= 0 ||
    Number(amount) > 100_000_000
  )
    throw new DomainError(
      "bad_amount",
      "Enter a demo-token amount from 0.01 to 100 million, with up to two decimal places.",
    );
  const who = getAddress(owner);
  const plan = await getPlan(ctx, who);
  const token = requireToken(ctx.deployment, "mUSD");
  if (
    !plan.howMoneyIsSpread.some(
      (holding) => holding.id.toLowerCase() === token.toLowerCase(),
    )
  )
    throw new DomainError(
      "cash_not_allocated",
      "Demo dollars are not included in your approved plan.",
      409,
    );
  const asset = await ctx.client.readContract({
    address: ctx.deployment.contracts.assetRegistry!,
    abi: AssetRegistryAbi,
    functionName: "getAsset",
    args: [token],
  });
  if (
    !asset.enabled ||
    !asset.isLiquid ||
    asset.symbol !== "mUSD" ||
    asset.decimals !== 6
  )
    throw new DomainError(
      "demo_asset_unavailable",
      "The demo savings asset is not configured correctly.",
      503,
    );
  const minimum = plan.goal.savings?.minimumContribution ?? "0.00";
  if (!meetsMinimumContribution(amount, minimum))
    throw new DomainError(
      "below_minimum_contribution",
      `Your chosen minimum per contribution is ${minimum} demo dollars.`,
      422,
    );
  const rawUnits = parseUnits(amount, 6);
  const [balance, allowance] = await Promise.all([
    readTokenBalance(ctx.client, token, who),
    readAllowance(ctx.client, ctx.deployment, token, who),
  ]);
  return {
    token,
    units: amount,
    rawUnits: rawUnits.toString(),
    vault: ctx.deployment.contracts.portfolioVault!,
    needsApproval: allowance < rawUnits,
    canCover: balance >= rawUnits,
    mode: "direct_demo_cash" as const,
  };
}

export async function prepareDirectRetrieval(
  ctx: DomainContext,
  owner: Address,
  amount: string,
) {
  if (ctx.deployment.chainId !== 10143)
    throw new DomainError(
      "demo_only",
      "Direct demo retrieval is available only on the demo test network.",
      403,
    );
  if (
    !/^\d{1,9}(\.\d{1,2})?$/.test(amount) ||
    Number(amount) <= 0 ||
    Number(amount) > 100_000_000
  )
    throw new DomainError(
      "bad_amount",
      "Enter a positive mUSD amount with up to two decimal places.",
    );
  const who = getAddress(owner);
  const token = requireToken(ctx.deployment, "mUSD");
  const vault = ctx.deployment.contracts.portfolioVault!;
  const [asset, balance, plan] = await Promise.all([
    ctx.client.readContract({
      address: ctx.deployment.contracts.assetRegistry!,
      abi: AssetRegistryAbi,
      functionName: "getAsset",
      args: [token],
    }),
    ctx.client.readContract({
      address: vault,
      abi: PortfolioVaultAbi,
      functionName: "balanceOf",
      args: [who, token],
    }),
    getPlan(ctx, who),
  ]);
  if (asset.symbol !== "mUSD" || asset.decimals !== 6)
    throw new DomainError(
      "demo_asset_unavailable",
      "This is not the configured demo-dollar asset.",
      503,
    );
  const rawUnits = parseUnits(amount, 6);
  if (balance < rawUnits)
    throw new DomainError(
      "too_much",
      "You don't have that many mUSD saved in this plan.",
      422,
    );
  return {
    token,
    vault,
    units: amount,
    rawUnits: rawUnits.toString(),
    reminderAt: plan.goal.savings
      ? retrievalReminderAt(plan.goal.savings)
      : null,
  };
}
