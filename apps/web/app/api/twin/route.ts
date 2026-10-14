import { findUserByWallet, listScenarios } from "@modalis/db";
import type { ScenarioRow } from "@modalis/db";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { loadTwinSnapshot, projectedResponse, candidateFromInputValue } from "./_lib";
import { simulateTwin } from "@modalis/domain";

export const dynamic = "force-dynamic";

/** Reads the live future and a starter alternative. This endpoint never writes or signs. */
export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    const snapshot = await loadTwinSnapshot(ctx, owner);
    const alternative = {
      ...snapshot.base,
      monthsRemaining: Math.max(1, Math.round(snapshot.base.monthsRemaining * 0.6)),
    };
    const result = projectedResponse(snapshot, alternative);
    let history: ScenarioRow[] = [];
    if (ctx.db) {
      const user = await findUserByWallet(ctx.db, owner);
      if (user) history = await listScenarios(ctx.db, user.id, snapshot.goalId, 12);
    }
    return jsonResponse({
      ...result,
      planVersion: snapshot.plan.version,
      goal: snapshot.plan.goal,
      history,
      liveBalance: snapshot.base.startingE18,
      liveCandidate: candidateFromInputValue(snapshot.base),
      lastCheckedBlock: snapshot.state.blockNumber,
      defaultAlternative: {
        ...candidateFromInputValue(alternative),
        outcome: simulateTwin(alternative),
      },
    });
  });
}
