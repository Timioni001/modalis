/**
 * GET /api/portfolio/[owner] — live portfolio state, read from Monad.
 *
 * No cache and no stored snapshot: positions, prices and rules all come from contract reads, so
 * what the dashboard shows is what the chain says.
 */
import { isAddress, getAddress } from "viem";
import { readExecutorPortfolioState, readManager, readPortfolio } from "@modalis/chain";
import { assessRisk } from "@modalis/portfolio";
import { explainRiskState } from "@modalis/ai";
import { toEngineInputs } from "@modalis/risk-monitor/src/monitor.ts";
import { getServerContext } from "@/lib/server";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ owner: string }> },
): Promise<Response> {
  const { owner: raw } = await params;
  if (!isAddress(raw)) return errorResponse("Not a valid address");
  const owner = getAddress(raw);

  try {
    const { client, deployment, deployed } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const state = await readPortfolio(client, deployment, owner);
    if (!state.hasMandate) {
      return jsonResponse({ owner, hasMandate: false, state: null, risk: null });
    }

    const { rules, allocations, values } = toEngineInputs(state);
    const risk = assessRisk(rules, allocations, values);
    const manager = await readManager(client, deployment, owner);

    // Cross-check our read path against the executor's own view. They must agree, because the
    // executor's numbers are what the mandate is validated against.
    const onchain = await readExecutorPortfolioState(client, deployment, owner).catch(() => null);
    const agrees =
      onchain === null ||
      (onchain.values.length === values.length && onchain.values.every((v, i) => v === values[i]));

    return jsonResponse({
      owner,
      hasMandate: true,
      state,
      risk,
      manager,
      riskSummary: explainRiskState({
        status: risk.status,
        maxDriftBps: risk.maxDriftBps,
        liquidityBps: risk.liquidityBps,
        largestPositionBps: risk.largestPositionBps,
        maxSingleAssetBps: state.mandate.maxSingleAssetBps,
        minLiquidityBps: state.mandate.minLiquidityBps,
      }),
      /** False would mean our valuation disagrees with the executor's; the UI surfaces it. */
      agreesWithExecutor: agrees,
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not read the portfolio", 500);
  }
}
