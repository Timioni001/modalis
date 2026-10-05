/**
 * POST /api/plan/compare — "what if?"
 *
 * Rebuilds the plan under a changed assumption and returns both, so a person can see what moves.
 * Writes nothing: changing a real plan needs their signature.
 *
 * Every funding figure assumes NO investment growth. The honest answer to "will I get there?" is
 * framed in money the person adds, never in a return Modalis would be guessing at.
 */
import { createPlan, type GoalAnswers } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, route } from "@/lib/api";
import { readUniverse } from "@/lib/universe";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "plan:compare", { max: 40, windowMs: 60_000 });

    const body = (await request.json().catch(() => null)) as {
      answers?: GoalAnswers;
      changes?: Partial<GoalAnswers>;
    } | null;
    if (!body?.answers) return errorResponse("We need your current answers to compare against.");

    const ctx = await domainContext();
    const universe = await readUniverse(ctx.client, ctx.deployment);
    const now = new Date();

    const [current, changed] = await Promise.all([
      createPlan(ctx, body.answers, universe, now),
      createPlan(ctx, { ...body.answers, ...(body.changes ?? {}) }, universe, now),
    ]);

    return jsonResponse({
      current: current.plan,
      changed: changed.plan,
      note:
        "These figures assume no investment growth. Modalis doesn't promise a return, and nothing " +
        "here is a prediction of how your money will perform.",
    });
  });
}
