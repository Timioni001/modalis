/**
 * GET /api/plan/status — is my plan on track?
 *
 * The question a person actually asks, answered from live on-chain balances rather than a cached
 * score. Returns on_plan / drifting / off_plan plus a sentence explaining it.
 */
import { getPlanStatus } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse(await getPlanStatus(ctx, owner));
  });
}
