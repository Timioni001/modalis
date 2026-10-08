/**
 * POST /api/money/withdrawal-plan — work out how to take money out, and what it costs.
 *
 * Nothing is signed here. The person's own wallet signs each withdrawal; the vault only lets an
 * owner withdraw their own balance, so the worst a compromised server could do is propose a plan
 * the person would still have to sign, step by step, seeing each amount.
 */
import { buildWithdrawalPlan } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { money } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "money:withdrawal-plan", { max: 20, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const amount = money((await readBody(request)).amount, "an amount");
    return jsonResponse({ withdrawal: await buildWithdrawalPlan(await domainContext(), owner, { amount }) });
  });
}
