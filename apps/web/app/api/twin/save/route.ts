import { createScenario, serverClient, upsertUser } from "@modalis/db";
import { domainContext, jsonResponse, readBody, rateLimit, requireOwner, route } from "@/lib/api";
import { text } from "@/lib/validate";
import { toJson } from "@/lib/serialize";
import { candidateFromInput, inputFromCandidate, loadTwinSnapshot, projectedResponse, savedTwinFutureFromRow } from "../_lib";

export const dynamic = "force-dynamic";

/** Stores a read-only branch for history. It is recalculated server-side before persistence. */
export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "twin:save", { max: 20, windowMs: 60_000 });
    const body = await readBody(request);
    const prompt = text(body.prompt, "a description of this future", { max: 240, required: true })!;
    const requestedName = text(body.name, "a name for this plan", { max: 80 });
    const ctx = await domainContext();
    const snapshot = await loadTwinSnapshot(ctx, owner);
    const candidate = candidateFromInput(body.alternative);
    const alternative = inputFromCandidate(candidate, snapshot.base.startingE18);
    const result = projectedResponse(snapshot, alternative);
    const db = serverClient();
    if (!db) return jsonResponse({ saved: false, result, note: "The future is calculated, but history is unavailable because no database is configured." });
    const user = await upsertUser(db, { walletAddress: owner, chainId: ctx.deployment.chainId });
    if (!user) return jsonResponse({ saved: false, result, note: "The future is calculated, but history could not be saved yet." }, { status: 207 });
    const row = await createScenario(db, {
      userId: user.id,
      goalId: snapshot.goalId,
      prompt,
      inputs: { kind: "plan", name: requestedName || prompt, base: result.baseCandidate, alternative: result.alternativeCandidate },
      result: toJson(result),
    });
    return jsonResponse({ saved: Boolean(row), scenarioId: row?.id ?? null, savedFuture: row ? savedTwinFutureFromRow(row) : null, result, note: row ? undefined : "The future is calculated, but history could not be saved yet." }, { status: row ? 200 : 207 });
  });
}
