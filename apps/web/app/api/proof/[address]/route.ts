/**
 * GET /api/proof/:address — a plan's limits and history, from the chain only.
 *
 * Public on purpose: it is what someone shares with a parent or partner so they can check the plan
 * without signing in. It returns nothing that isn't already public on Monad (the on-chain plan,
 * balances and events for that address) and nothing from Modalis's database, so no name, goal text
 * or email ever appears here.
 */
import { getActivity } from "@modalis/domain";
import { readPortfolio } from "@modalis/chain";
import { getAddress, isAddress } from "viem";
import { domainContext, jsonResponse, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ address: string }> }): Promise<Response> {
  return route(async () => {
    const raw = (await params).address;
    if (!isAddress(raw)) return errorResponse("That isn't a valid account address.", 400);
    const owner = getAddress(raw);
    const ctx = await domainContext();
    // No database half: only what the chain itself recorded.
    const [state, activity] = await Promise.all([
      readPortfolio(ctx.client, ctx.deployment, owner),
      getActivity({ ...ctx, db: null }, owner, { planId: null }),
    ]);
    return jsonResponse({
      owner,
      hasPlan: state.hasMandate,
      blockNumber: state.blockNumber,
      limits: state.mandate,
      totalValueE18: state.totalValueE18,
      positions: state.positions.map((p) => ({
        symbol: p.symbol,
        valueE18: p.valueE18,
        allocationBps: p.allocationBps,
        targetBps: p.targetBps,
        minBps: p.minBps,
        maxBps: p.maxBps,
      })),
      activity: activity.items.map((i) => ({ title: i.title, detail: i.detail, receipt: i.receipt?.reference ?? null })),
      contracts: {
        portfolioMandate: ctx.deployment.contracts.portfolioMandate ?? null,
        portfolioVault: ctx.deployment.contracts.portfolioVault ?? null,
        rebalanceExecutor: ctx.deployment.contracts.rebalanceExecutor ?? null,
      },
    });
  });
}
