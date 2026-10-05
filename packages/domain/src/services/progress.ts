/**
 * Progress: am I going to get there?
 *
 * Every forward-looking number here assumes ZERO investment growth. Modalis does not promise a
 * return, so the only honest answer is framed in money the person themselves adds. Showing a
 * projected return as a path to the goal would be presenting a guess as a promise.
 */
import { readPortfolio } from "@modalis/chain";
import { getAddress, type Address } from "viem";
import { DomainError, type DomainContext } from "../context.ts";
import { toProgress } from "../translate.ts";
import type { Progress } from "../models.ts";

export async function getProgress(
  ctx: DomainContext,
  owner: Address,
  monthlyContributionE18 = 0n,
  now = new Date(),
): Promise<Progress> {
  const state = await readPortfolio(ctx.client, ctx.deployment, getAddress(owner));
  if (!state.hasMandate) {
    throw new DomainError("no_plan", "You don't have a plan yet, so there's no progress to show.", 404);
  }
  return toProgress(state, monthlyContributionE18, now);
}
