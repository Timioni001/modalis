/**
 * GET /api/goal — what I'm saving for, and whether it's going to happen.
 *
 * The goal is assembled from both places that hold part of it: the chain has the target and the
 * date (because those bound what Modalis may do), the database has the name and the contribution
 * (because a contract has no business storing "A home in Lisbon").
 *
 * Every forward-looking figure assumes NO growth, which is the only honest assumption a product
 * that cannot predict the market is entitled to make.
 */
import { getGoal } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse(await getGoal(ctx, owner));
  });
}
