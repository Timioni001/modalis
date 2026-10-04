/**
 * POST /api/scenario — the controlled market movement.
 *
 * Writes prices to the DEMO oracle so a mandate breach can be produced on demand. The price move
 * is the only synthetic thing in the whole flow; the breach it causes is computed from real
 * on-chain balances, and everything downstream is a real transaction.
 *
 * Gated on DEMO_MODE and refuses to run on mainnet. The UI must label the result as simulated.
 */
import {
  breachLargestHoldingScenario,
  btcRallyScenario,
  refreshPrices,
  resetScenario,
  runScenario,
} from "@modalis/risk-monitor/src/scenario.ts";
import { readPortfolio, requireToken } from "@modalis/chain";
import { getAddress, isAddress } from "viem";
import { getOracleWallet, getServerContext, isDemoMode } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  if (!isDemoMode()) {
    return errorResponse("The scenario engine is only available with DEMO_MODE enabled.", 403);
  }

  let id: string;
  let owner: string | undefined;
  try {
    const body = (await request.json()) as { scenario?: string; owner?: string };
    id = body.scenario ?? "breach_largest";
    owner = body.owner;
  } catch {
    id = "breach_largest";
  }

  try {
    const { client, deployment, deployed, rpc } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);
    if (deployment.chainId === 143) return errorResponse("Not available on Monad mainnet.", 403);
    if (!deployment.contracts.priceOracle) {
      return errorResponse("No demo oracle is deployed, so there is no scenario to run.", 503);
    }

    const wallet = getOracleWallet(rpc);
    if (!wallet) {
      return errorResponse("No oracle updater key configured. Set ORACLE_UPDATER_PRIVATE_KEY.", 503);
    }

    const tokens = {
      mBTC: requireToken(deployment, "mBTC"),
      mETH: requireToken(deployment, "mETH"),
      mBOND: requireToken(deployment, "mBOND"),
      mUSD: requireToken(deployment, "mUSD"),
    };

    if (id === "reset") {
      const result = await runScenario(wallet, client, deployment, resetScenario(tokens));
      return jsonResponse({ ...result, simulated: true, title: "Demo prices reset" });
    }
    if (id === "refresh") {
      const result = await refreshPrices(
        wallet,
        client,
        deployment,
        Object.entries(tokens).map(([symbol, token]) => ({ symbol, token })),
      );
      return jsonResponse({ ...result, simulated: true, title: "Demo prices refreshed" });
    }
    if (id === "breach_largest") {
      // Computed from the portfolio's current holdings, so the demo is repeatable: after a
      // rebalance the old fixed price no longer breaches anything.
      if (!owner || !isAddress(owner)) {
        return errorResponse("This scenario needs an `owner` address to read the portfolio from.");
      }
      const state = await readPortfolio(client, deployment, getAddress(owner));
      if (!state.hasMandate) return errorResponse("That portfolio has no mandate.", 409);
      if (state.totalValueE18 === 0n) return errorResponse("That portfolio is empty.", 409);

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
      const result = await runScenario(wallet, client, deployment, scenario);
      return jsonResponse({
        ...result,
        simulated: true,
        title: scenario.title,
        description: scenario.description,
      });
    }
    if (id === "btc_rally") {
      const scenario = btcRallyScenario({ mBTC: tokens.mBTC });
      const result = await runScenario(wallet, client, deployment, scenario);
      return jsonResponse({ ...result, simulated: true, title: scenario.title, description: scenario.description });
    }

    return errorResponse(`Unknown scenario "${id}". Use breach_largest, btc_rally, reset or refresh.`);
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not run the scenario", 500);
  }
}
