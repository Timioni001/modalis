/**
 * POST /api/plan/draft — turn a goal into a plan.
 *
 * Writes nothing anywhere. Returns the plan for the person to look at, plus an opaque `approval`
 * blob their own wallet signs if they accept it. The server never signs a plan: a plan is the
 * boundary on Modalis's own authority, so letting a server key write one would defeat its purpose.
 */
import { createPlan, type GoalAnswers } from "@modalis/domain";
import { domainContext, jsonResponse, route } from "@/lib/api";
import { readUniverse } from "@/lib/universe";
import { optionalSession } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const REQUIRED: (keyof GoalAnswers)[] = [
  "goalKind",
  "targetAmount",
  "startingAmount",
  "contributionAmount",
  "contributionCadence",
  "monthsUntilNeeded",
  "ifItFellResponse",
  "comfortableLosingPercent",
  "moneyKeptAvailable",
  "incomeSteadiness",
];

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const body = (await request.json().catch(() => null)) as Partial<GoalAnswers> | null;
    if (!body) return errorResponse("We couldn't read those answers.");
    for (const key of REQUIRED) {
      if (body[key] === undefined || body[key] === null) {
        return errorResponse(`We still need an answer for "${String(key)}".`);
      }
    }

    const ctx = await domainContext();
    const universe = await readUniverse(ctx.client, ctx.deployment);
    const drafted = await createPlan(ctx, body as GoalAnswers, universe);

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
