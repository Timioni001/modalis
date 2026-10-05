/**
 * GET /api/plan — the plan that is actually live.
 *
 * Read from the chain, which is the source of truth for the rules. Requires sign-in, because
 * which plan to read is determined by who is asking, never by a parameter.
 */
import { getPlan } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    const plan = await getPlan(ctx, owner);
    return jsonResponse({ plan });
  });
}
