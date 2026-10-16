/**
 * POST /api/goal/scenarios — "what if?", answered against the person's real goal.
 *
 * Reads only. Nothing here changes a plan: that needs the person's approval and their signature.
 *
 * The set of questions is closed on purpose. A free-text box invites questions this engine cannot
 * answer honestly — "what if the market goes up 20%" has no answer that isn't a guess — so the
 * product only offers the questions it can answer from money the person controls.
 */
import {
  getScenarios,
  type Scenario,
  type ScenarioKind,
} from "@modalis/domain";
import {
  domainContext,
  jsonResponse,
  rateLimit,
  readBody,
  requireOwner,
  route,
} from "@/lib/api";
import { integer, money, oneOf } from "@/lib/validate";

export const dynamic = "force-dynamic";

const KINDS = [
  "add_more",
  "add_less",
  "finish_later",
  "finish_earlier",
  "raise_target",
  "lower_target",
  "pause_contributions",
  "add_lump_sum",
  "withdraw",
] as const satisfies readonly ScenarioKind[];

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "goal:scenarios", { max: 60, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const body = await readBody(request);
    const ctx = await domainContext();
    const base =
      body.baseAmount === undefined
        ? undefined
        : typeof body.baseAmount === "string" &&
            /^0(\.0{1,2})?$/.test(body.baseAmount)
          ? "0"
          : money(body.baseAmount, "a calculation starting amount", {
              max: 100_000_000,
            });

    // No question asked: return the questions this person could ask.
    if (body.kind === undefined) {
      return jsonResponse(
        await getScenarios(ctx, owner, undefined, new Date(), base),
      );
    }

    const kind = oneOf(body.kind, "the change", KINDS);
    const ask: Scenario = {
      kind,
      question: "",
      ...(body.amount !== undefined
        ? {
            amount: Number(
              money(body.amount, "an amount", { max: 100_000_000 }),
            ),
          }
        : {}),
      ...(body.months !== undefined
        ? {
            months: integer(body.months, "a number of months", {
              min: 1,
              max: 600,
            }),
          }
        : {}),
    };

    return jsonResponse(await getScenarios(ctx, owner, ask, new Date(), base));
  });
}
