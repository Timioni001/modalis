/** POST /api/goals/preview — "if I add $X, which goal does it go to?" Nothing is written. */
import { previewContribution, usdToE18 } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { money } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "goals:preview", { max: 60, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const amount = Number(money((await readBody(request)).amount, "an amount", { max: 100_000_000 }));
    return jsonResponse({ destinations: await previewContribution(await domainContext(), owner, usdToE18(amount)) });
  });
}
