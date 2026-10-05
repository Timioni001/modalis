/**
 * GET /api/money — what I have right now.
 *
 * Always read live from the chain. A stale balance in a money product is worse than a spinner.
 */
import { getMoney } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse({ money: await getMoney(ctx, owner) });
  });
}
