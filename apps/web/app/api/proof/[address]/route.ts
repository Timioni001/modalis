/**
 * GET /api/proof/:address — a plan's limits and history, from the chain only.
 *
 * Public on purpose: it is what someone shares with a parent or partner so they can check the plan
 * without signing in. It returns nothing that isn't already public on Monad (the on-chain plan,
 * balances and events for that address) and nothing from Modalis's database, so no name, goal text
 * or email ever appears here.
 */
import { getActivity } from "@modalis/domain";
import { agentIdentity, agentLabel, readManager, readPortfolio } from "@modalis/chain";
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
    const [state, activity, manager] = await Promise.all([
      readPortfolio(ctx.client, ctx.deployment, owner),
      getActivity({ ...ctx, db: null }, owner, { planId: null }),
      readManager(ctx.client, ctx.deployment, owner).catch(() => null),
    ]);
    // Who the owner allowed to make adjustments, read from the plan contract. When it is this
    // deployment's agent, say how that agent is held (a Dynamic server wallet, or a plain key).
    const agent = agentIdentity();
    const allowed = manager && !/^0x0{40}$/i.test(manager) ? getAddress(manager) : null;
    const allowedLabel = allowed && agent && allowed === agent.address ? agentLabel(agent.kind) : null;
    // Label an adjustment with the agent only when the chain says the agent sent it; an older one
    // may have come from a previous signer.
    const signers = new Map<string, string>();
    if (agent) {
      await Promise.all(
        activity.items
          .filter((i) => i.kind === "adjustment_made" && i.receipt?.reference?.startsWith("0x"))
          .slice(0, 25)
          .map(async (i) => {
            const hash = i.receipt!.reference as `0x${string}`;
            const tx = await ctx.client.getTransaction({ hash }).catch(() => null);
            if (tx && getAddress(tx.from) === agent.address) signers.set(hash, agentLabel(agent.kind));
          }),
      );
    }
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
      activity: activity.items.map((i) => ({
        title: i.title,
        detail: i.detail,
        receipt: i.receipt?.reference ?? null,
        signedBy: (i.receipt?.reference && signers.get(i.receipt.reference)) || null,
      })),
      manager: allowed ? { address: allowed, label: allowedLabel } : null,
      contracts: {
        portfolioMandate: ctx.deployment.contracts.portfolioMandate ?? null,
        portfolioVault: ctx.deployment.contracts.portfolioVault ?? null,
        rebalanceExecutor: ctx.deployment.contracts.rebalanceExecutor ?? null,
      },
    });
  });
}
