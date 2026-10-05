/**
 * POST /api/adjustment/execute — carry out the recommended change.
 *
 * This is the most sensitive endpoint in the product, and it is protected in four layers:
 *
 *  1. SIGN-IN. The acting account comes from a verified Dynamic token. It is never read from the
 *     request body — that was the hole this replaced, where anyone could post someone else's
 *     address and make the Modalis manager key act on their plan.
 *  2. OWNERSHIP. The plan acted on is the signed-in person's, by construction: there is no
 *     parameter to name a different one.
 *  3. PERMISSION. The person must have authorised Modalis to propose adjustments at all, which
 *     they grant and withdraw on-chain.
 *  4. THE CONTRACT. The proposal is rebuilt from live chain state, never accepted from the
 *     caller, and RebalanceExecutor re-checks authorisation, plan version, deadline, replay,
 *     price protection, venue and post-trade compliance with every rule. It is the final
 *     authority, and nothing here can talk it out of a refusal.
 */
import { executeAdjustment, getPlan } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { getManagerWallet } from "@/lib/server";
import { getServerContext } from "@/lib/server";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();

    // The person must have granted Modalis permission to adjust their plan.
    const plan = await getPlan(ctx, owner);
    if (!plan.adjustmentsEnabled) {
      return errorResponse(
        "You haven't given Modalis permission to adjust your plan. You can turn that on in your settings.",
        403,
      );
    }
    if (plan.status === "paused") {
      return errorResponse("Your plan is paused, so Modalis won't make any changes.", 409);
    }

    const { rpc } = await getServerContext();
    const wallet = getManagerWallet(rpc);
    if (!wallet) {
      return errorResponse(
        "Modalis can't make adjustments on this deployment because it has no signing key configured.",
        503,
      );
    }

    return jsonResponse({ adjustment: await executeAdjustment(ctx, owner, wallet) });
  });
}
