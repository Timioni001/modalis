/** Owner-scoped, off-chain preferences. Never changes withdrawal permissions or signs a plan. */
import {
  getPlan,
  normaliseSavingsPreferences,
  savingsPreferenceProblem,
  type SavingsPreferences,
} from "@modalis/domain";
import { emit } from "@modalis/domain";
import { activeMandate, findUserByWallet, updateGoal } from "@modalis/db";
import {
  domainContext,
  jsonResponse,
  rateLimit,
  readBody,
  requireOwner,
  route,
} from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "plan:savings", { max: 20, windowMs: 60_000 });
    const body = await readBody(request);
    const problem = savingsPreferenceProblem(body);
    if (problem) return errorResponse(problem, 400);
    const ctx = await domainContext();
    if (!ctx.db)
      return errorResponse(
        "Saving personal preferences needs the demo database to be configured. Your on-chain plan is unchanged.",
        503,
      );
    const user = await findUserByWallet(ctx.db, owner);
    const mandate = user ? await activeMandate(ctx.db, user.id) : null;
    if (!user || !mandate?.goal_id)
      return errorResponse(
        "Save your approved goal details before editing its preferences.",
        409,
      );
    const plan = await getPlan(ctx, owner);
    const preferences = normaliseSavingsPreferences(body as SavingsPreferences);
    // The client cannot choose a fake approval date. A previously unknown start remains unknown.
    let startedAt = plan.goal.savings?.startedAt;
    if (!startedAt && mandate.set_tx_hash) {
      const receipt = await ctx.client.getTransactionReceipt({
        hash: mandate.set_tx_hash as `0x${string}`,
      });
      const block = await ctx.client.getBlock({ blockHash: receipt.blockHash });
      startedAt = new Date(Number(block.timestamp) * 1000).toISOString();
    }
    const goal = await updateGoal(ctx.db, user.id, mandate.goal_id, {
      savingsPreferences: {
        ...preferences,
        ...(startedAt ? { startedAt } : {}),
      },
    });
    if (!goal)
      return errorResponse(
        "We couldn't save those preferences. Try again after checking the database migration.",
        503,
      );
    await emit(ctx.db, {
      userId: user.id,
      type: "goal_updated",
      goalId: goal.id,
      payload: { name: goal.name },
    });
    return jsonResponse({ saved: true });
  });
}
