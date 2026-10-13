/**
 * Building a withdrawal the person can sign (§23).
 *
 * The server works out WHAT would happen — which holdings, how many units, what it does to the
 * kept-available floor, which goal it comes out of, and how much later that goal arrives. The
 * person's own wallet then signs each `withdraw` call. No Modalis key can move money out.
 */
import { readPortfolio, usdToTokenAmount } from "@modalis/chain";
import { getAddress, type Address } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import { allocateAcrossGoals } from "../goals.ts";
import { moneyFromE18, moneyInSentence, type Money } from "../models.ts";
import { displayName, unitsToDecimal } from "../translate.ts";
import { planWithdrawal } from "../withdrawals.ts";
import { goalBookFor } from "./goals.ts";
import { getScenarios } from "./goal.ts";
import { usdStringToE18 } from "./money.ts";
import { getPlan } from "./plans.ts";
import { retrievalReminderAt } from "../savings-preferences.ts";

export type WithdrawalStep = {
  id: string;
  holdingId: string;
  holdingName: string;
  units: string;
  rawUnits: string;
  value: Money;
  status: "pending" | "in_progress" | "done" | "failed";
  description: string;
};

export type WithdrawalPlan = {
  total: Money;
  steps: WithdrawalStep[];
  /** One sentence each: what this costs, in the person's terms. */
  consequences: string[];
  keepsAvailableFloor: boolean;
  availablePercentAfter: number;
};

export async function buildWithdrawalPlan(
  ctx: DomainContext,
  owner: Address,
  request: { amount: string },
  now = new Date(),
): Promise<WithdrawalPlan> {
  const who = getAddress(owner);
  const amountE18 = usdStringToE18(request.amount);
  if (amountE18 <= 0n) throw new DomainError("bad_amount", "Enter an amount greater than zero.");

  const state = await readPortfolio(ctx.client, ctx.deployment, who);
  if (!state.hasMandate) throw new DomainError("no_plan", "There's no plan to withdraw from.", 409);
  if (amountE18 > state.totalValueE18) {
    throw new DomainError(
      "too_much",
      `You have ${moneyInSentence(moneyFromE18(state.totalValueE18))} in your plan. To take it all out, use "Take all my money out".`,
    );
  }

  const split = planWithdrawal(
    state.positions.map((p) => ({ id: p.token, valueE18: p.valueE18, targetBps: p.targetBps, isLiquid: p.isLiquid })),
    amountE18,
    state.mandate.minLiquidityBps,
  );

  const steps: WithdrawalStep[] = [];
  for (const part of split.parts) {
    if (part.amountE18 === 0n) continue;
    const position = state.positions.find((p) => p.token === part.id)!;
    let units = await usdToTokenAmount(ctx.client, ctx.deployment, position.token, part.amountE18, position.decimals);
    // Never ask the vault for more than it holds: price rounding must not produce a revert.
    if (units > position.amount) units = position.amount;
    if (units === 0n) continue;
    const name = displayName(position.symbol);
    const unitsText = unitsToDecimal(units, position.decimals);
    steps.push({
      id: `withdraw:${position.token}`,
      holdingId: position.token,
      holdingName: name,
      units: unitsText,
      rawUnits: units.toString(),
      value: moneyFromE18(part.amountE18),
      status: "pending",
      description: `Take ${moneyInSentence(moneyFromE18(part.amountE18))} out of ${name}.`,
    });
  }
  if (steps.length === 0) throw new DomainError("amount_too_small", "That amount is too small to withdraw.");

  const consequences: string[] = [];
  if (ctx.db) {
    const savings = (await getPlan(ctx, who)).goal.savings;
    const reminderAt = savings ? retrievalReminderAt(savings) : null;
    if (reminderAt && Date.parse(reminderAt) > now.getTime()) {
      consequences.push(`You planned to wait until ${new Date(reminderAt).toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })} (UTC) before retrieving savings. This is a personal reminder; you can still withdraw early.`);
    }
  }

  // Which goal it comes out of: under the waterfall, the lowest-priority funded goals shrink first.
  try {
    const { book } = await goalBookFor(ctx, who);
    const specs = book.shares.map((s) => s.goal);
    const after = allocateAcrossGoals(book.totalE18 - amountE18, specs);
    const hit = book.shares
      .map((s, i) => ({ name: s.goal.name, lost: s.earmarkedE18 - after.shares[i].earmarkedE18 }))
      .filter((x) => x.lost > 0n);
    const fromSurplus = book.surplusE18 > 0n ? (amountE18 < book.surplusE18 ? amountE18 : book.surplusE18) : 0n;
    if (fromSurplus > 0n) consequences.push(`${moneyInSentence(moneyFromE18(fromSurplus))} comes from money beyond your goals.`);
    for (const h of hit) consequences.push(`${moneyInSentence(moneyFromE18(h.lost))} comes out of ${h.name.toLowerCase()}.`);
  } catch {
    // Goal accounting is a courtesy here; the withdrawal itself does not depend on it.
  }

  try {
    const r = await getScenarios(ctx, who, { kind: "withdraw", question: "", amount: Number(request.amount) });
    if (r.result) consequences.push(r.result.answer);
  } catch {
    // Same: no goal data must not block someone taking their own money out.
  }

  const availablePercentAfter = split.availableBpsAfter / 100;
  if (!split.keepsAvailableFloor) {
    consequences.push(
      `Afterwards only ${availablePercentAfter}% would be easy to withdraw — your plan keeps at least ${state.mandate.minLiquidityBps / 100}%. Modalis will suggest a change to restore it.`,
    );
  }

  return {
    total: moneyFromE18(amountE18),
    steps,
    consequences,
    keepsAvailableFloor: split.keepsAvailableFloor,
    availablePercentAfter,
  };
}
