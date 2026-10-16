/**
 * POST /api/plan/draft — turn a goal into a plan.
 *
 * Writes nothing anywhere. Returns the plan for the person to look at, plus an opaque `approval`
 * blob their own wallet signs if they accept it. The server never signs a plan: a plan is the
 * boundary on Modalis's own authority, so letting a server key write one would defeat its purpose.
 */
import { createPlan, parseGoalAnswers } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, route } from "@/lib/api";
import { readUniverse } from "@/lib/universe";
import { optionalSession } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    // Open to anyone signed in or not, so it needs a limit of its own: it runs the planner and,
    // when a free-text goal is present, reaches the AI layer.
    await rateLimit(request, "plan:draft", { max: 30, windowMs: 60_000 });

    const body = parseGoalAnswers(await request.json().catch(() => null));

    const ctx = await domainContext();
    const universe = await readUniverse(ctx.client, ctx.deployment);
    const drafted = await createPlan(ctx, body, universe);

    // Signing in is not required to see what a plan would look like — only to make one real.
    const session = await optionalSession(request);

    return jsonResponse({
      plan: drafted.plan,
      approval: drafted.approval,
      understoodAs: drafted.understoodAs ?? null,
      signedIn: Boolean(session),
    });
  });
}
