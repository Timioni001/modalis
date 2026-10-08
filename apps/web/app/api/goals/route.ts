/**
 * GET  /api/goals — every goal, in funding order, each with its share of the portfolio.
 * POST /api/goals — add a goal. It joins the back of the queue until reordered.
 *
 * The owner is the verified session. The total each goal is divided from is read from the chain.
 */
import { addGoal, getGoals } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { newGoalFrom } from "./shared";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    return jsonResponse(await getGoals(await domainContext(), owner));
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "goals:create", { max: 10, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const input = newGoalFrom(await readBody(request));
    return jsonResponse(await addGoal(await domainContext(), owner, input), { status: 201 });
  });
}
