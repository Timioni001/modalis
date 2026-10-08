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
 *
 * On top of those: a one-time key, so a double tap replays the first answer instead of spending
 * the manager key's gas twice, and a rate limit, because this is the one route a signed-in person
 * can use to make the server pay for something.
 */
import { automationFor, checkMilestones, emitFor, executeAdjustment, getPlan, mayExecuteOnRequest } from "@modalis/domain";
import {
  domainContext,
  idempotent,
  jsonResponse,
  rateLimit,
  readBody,
  requireOwner,
  route,
} from "@/lib/api";
import { getManagerWallet } from "@/lib/server";
import { count } from "@/lib/observe";
import { getServerContext } from "@/lib/server";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "adjustment:execute", { max: 6, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const body = await readBody(request);

    return idempotent(owner, "adjustment:execute", body, async () => {
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
      // Guided means suggestions only. The person chose that; a tap does not override it.
      if (!mayExecuteOnRequest(await automationFor(ctx, owner), new Date())) {
        return errorResponse(
          "You've chosen suggestions only, so Modalis won't carry out changes. You can change that in your settings.",
          409,
        );
      }

      const { rpc } = await getServerContext();
      const wallet = getManagerWallet(rpc);
      if (!wallet) {
        return errorResponse(
          "Modalis can't make adjustments on this deployment because it has no signing key configured.",
          503,
        );
      }

      const adjustment = await executeAdjustment(ctx, owner, wallet);

      // Record what happened. A refusal by the person's own rules is an event too — it is the
      // moment the limits did their job, and it leaves no trace on-chain because it reverted.
      if (adjustment.status === "done") {
        await emitFor(ctx, owner, {
          type: "adjustment_executed",
          txHash: adjustment.receipt?.reference,
          payload: { explanation: adjustment.explanation },
        });
        await checkMilestones(ctx, owner).catch(() => undefined);
      } else if (!adjustment.allowedByYourRules) {
        count("policy.refused");
        await emitFor(ctx, owner, {
          type: "adjustment_blocked",
          payload: { explanation: adjustment.blockedBecause ? `Refused: ${adjustment.blockedBecause}.` : adjustment.explanation },
        });
      }

      return jsonResponse({ adjustment });
    });
  });
}
