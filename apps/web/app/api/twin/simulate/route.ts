import { domainContext, jsonResponse, readBody, rateLimit, requireOwner, route } from "@/lib/api";
import { candidateFromInput, inputFromCandidate, loadTwinSnapshot, projectedResponse } from "../_lib";

export const dynamic = "force-dynamic";

/** Recalculates a proposed future against the latest live balance. Read-only by design. */
export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    await rateLimit(request, "twin:simulate", { max: 60, windowMs: 60_000 });
    const body = await readBody(request);
    const ctx = await domainContext();
    const snapshot = await loadTwinSnapshot(ctx, owner);
    const candidate = candidateFromInput(body.alternative);
    const alternative = inputFromCandidate(candidate, snapshot.base.startingE18);
    return jsonResponse(projectedResponse(snapshot, alternative));
  });
}
