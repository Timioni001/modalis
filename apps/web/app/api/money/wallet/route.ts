/**
 * GET /api/money/wallet — what the person holds, before any of it is in a plan.
 *
 * Lets the funding screen say "you don't have enough" before anything is signed, rather than
 * after a transaction fails.
 */
import { getWalletBalances } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse({ holdings: await getWalletBalances(ctx, owner) });
  });
}
