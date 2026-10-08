/**
 * GET /api/exposure — what the person's money depends on, grouped by investment, kind, issuer,
 * trading venue, chain and risk. Built from live balances; the venue is what this deployment
 * actually trades through, never assumed.
 */
import { exposureOf, getMoney } from "@modalis/domain";
import { deployedIntegrations } from "@modalis/chain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    const money = await getMoney(ctx, owner);
    const venue = deployedIntegrations(ctx.deployment).kuru ? "Kuru" : "Test fixture (not a real market)";
    return jsonResponse({ exposure: exposureOf(money, venue) });
  });
}
