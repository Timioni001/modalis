/**
 * POST /api/money/funding-plan — work out how to put money in.
 *
 * The server decides WHAT should happen: it splits the amount across investments by the plan's
 * own targets, converts to units at live prices, and checks the person holds enough. The person's
 * WALLET then signs each step.
 *
 * That split is deliberate. Putting money in is an owner action, so no server key may do it, and
 * the worst a compromised server could do is propose a funding plan the person would still have
 * to sign.
 */
import { buildFundingPlan } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const body = (await request.json().catch(() => null)) as { amount?: string } | null;
    if (!body?.amount) return errorResponse("How much would you like to add?");

    const ctx = await domainContext();
    const funding = await buildFundingPlan(ctx, owner, { amount: String(body.amount) });

    return jsonResponse({
      funding,
      // Everything the wallet needs to carry out the steps, without the UI knowing what a vault is.
      contracts: {
        depositTo: ctx.deployment.contracts.portfolioVault,
      },
    });
  });
}
