/** GET /api/plans — the live plan and saved plan alternatives for the signed-in owner. */
import { findUserByWallet, listScenarios } from "@modalis/db";
import type { ScenarioRow } from "@modalis/db";
import { getPlan } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";
import { savedTwinFutureFromRow } from "../twin/_lib";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    const plan = await getPlan(ctx, owner);
    let history: ScenarioRow[] = [];
    if (ctx.db) {
      const user = await findUserByWallet(ctx.db, owner);
      if (user) history = await listScenarios(ctx.db, user.id, plan.goal.id, 12);
    }
    const drafts = history.flatMap((row) => {
      const saved = savedTwinFutureFromRow(row);
      return saved ? [saved] : [];
    });
    return jsonResponse({
      active: {
        id: plan.goal.id,
        name: plan.goal.name,
        target: plan.goal.target,
        targetDate: plan.goal.targetDate,
        monthly: plan.goal.contribution.amount,
        version: plan.version,
        status: plan.status,
      },
      drafts,
      saved: Boolean(ctx.db),
    });
  });
}
