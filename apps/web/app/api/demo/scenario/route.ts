/**
 * POST /api/demo/scenario — a controlled market movement, for demonstrating the loop.
 *
 * Writes a SYNTHETIC price to the demo oracle so a plan can be pushed off target on demand. The
 * price is made up and the response says so; everything that follows from it — the plan going off
 * target, the recommendation, the rules' decision, the settlement — is real.
 *
 * Authenticated and owner-scoped: the breach scenario is computed from the signed-in person's own
 * holdings. Gated on DEMO_MODE and refused on mainnet.
 */
import {
  breachLargestHoldingScenario,
  refreshPrices,
  resetScenario,
  runScenario,
} from "@modalis/risk-monitor";
import { readPortfolio, requireToken } from "@modalis/chain";
import { toReceipt } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, rateLimit, route } from "@/lib/api";
import { getOracleWallet, getServerContext, isDemoMode } from "@/lib/server";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    if (!isDemoMode()) return errorResponse("This is only available on a demo deployment.", 403);

    const owner = await requireOwner(request);
    await rateLimit(request, "demo:scenario", { max: 10, windowMs: 60_000 });
    const body = (await request.json().catch(() => ({}))) as { scenario?: string };
    const id = body.scenario ?? "off_target";

    const ctx = await domainContext();
    if (ctx.deployment.chainId === 143) return errorResponse("Not available on the live network.", 403);
    if (!ctx.deployment.contracts.priceOracle) {
      return errorResponse("This deployment has no demo pricing to move.", 503);
    }

    const { rpc } = await getServerContext();
    const wallet = getOracleWallet(rpc);
    if (!wallet) return errorResponse("No demo pricing key is configured.", 503);

    const tokens = {
      mBTC: requireToken(ctx.deployment, "mBTC"),
      mETH: requireToken(ctx.deployment, "mETH"),
      mBOND: requireToken(ctx.deployment, "mBOND"),
      mUSD: requireToken(ctx.deployment, "mUSD"),
    };

    const respond = (result: { writes: { symbol: string; hash: string; blockNumber: bigint }[] }, title: string, description: string) =>
      jsonResponse({
        title,
        description,
        simulated: true,
        receipts: result.writes.map((w) => toReceipt(w.hash, true, ctx.explorerUrl)),
      });

    if (id === "reset") {
      const result = await runScenario(wallet, ctx.client, ctx.deployment, resetScenario(tokens));
      return respond(result, "Prices reset", "Demo prices are back to where they started.");
    }

    if (id === "refresh") {
      const result = await refreshPrices(
        wallet,
        ctx.client,
        ctx.deployment,
        Object.entries(tokens).map(([symbol, token]) => ({ symbol, token })),
      );
      return respond(result, "Prices refreshed", "Demo prices were re-published so they stay current.");
    }

    if (id === "off_target") {
      const state = await readPortfolio(ctx.client, ctx.deployment, owner);
      if (!state.hasMandate) return errorResponse("You don't have a plan yet.", 409);
      if (state.totalValueE18 === 0n) return errorResponse("Add some money first.", 409);

      // Computed from live holdings so the demonstration still works after an adjustment:
      // a fixed price move is absorbed once the plan has been corrected.
      const scenario = breachLargestHoldingScenario({
        positions: state.positions.map((p) => ({
          symbol: p.symbol,
          token: p.token,
          valueE18: p.valueE18,
          priceE18: p.priceE18,
          isLiquid: p.isLiquid,
          maxBps: p.maxBps,
          assetMaxBps: p.assetMaxBps,
        })),
        totalValueE18: state.totalValueE18,
        maxSingleAssetBps: state.mandate.maxSingleAssetBps,
      });
      const result = await runScenario(wallet, ctx.client, ctx.deployment, scenario);
      return respond(result, scenario.title, scenario.description);
    }

    return errorResponse(`Unknown demonstration "${id}".`);
  });
}
