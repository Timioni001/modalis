import { domainContext, jsonResponse, readBody, rateLimit, requireOwner, route } from "@/lib/api";
import { uuid } from "@/lib/validate";
import { candidateFromInput, inputFromCandidate, loadTwinSnapshot, mandateForTwin, projectedResponse } from "../_lib";

export const dynamic = "force-dynamic";

/** Builds the exact owner-signed mandate update. Building a preview never writes to Monad. */
export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "twin:prepare", { max: 20, windowMs: 60_000 });
    const body = await readBody(request);
    const ctx = await domainContext();
    const snapshot = await loadTwinSnapshot(ctx, owner);
    const candidate = candidateFromInput(body.alternative);
    const alternative = inputFromCandidate(candidate, snapshot.base.startingE18);
    const mandate = mandateForTwin(snapshot, alternative);
    const result = projectedResponse(snapshot, alternative);
    return jsonResponse({
      candidate,
      result,
      scenarioId: body.scenarioId === undefined ? null : uuid(body.scenarioId, "that saved future"),
      approval: {
        params: mandate.params,
        allocations: mandate.allocations,
      },
      preview: {
        current: {
          targetValue: snapshot.state.mandate.targetValue,
          targetDate: snapshot.state.mandate.targetDate,
          maxDrawdownBps: snapshot.state.mandate.maxDrawdownBps,
          minLiquidityBps: snapshot.state.mandate.minLiquidityBps,
          rebalanceThresholdBps: snapshot.state.mandate.rebalanceThresholdBps,
          maxSingleAssetBps: snapshot.state.mandate.maxSingleAssetBps,
        },
        proposed: mandate.params,
      },
      note: "Approving updates the guardrails and goal date on Monad. It does not withdraw, deposit, or trade any funds.",
    });
  });
}
