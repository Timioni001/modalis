/**
 * POST /api/scenarios/project — the "What if?" simulator.
 *
 * Recomputes the plan under changed assumptions (a different contribution, target date, drawdown
 * ceiling or target amount) and returns the mandate it WOULD produce, side by side with the
 * current one. It writes nothing: changing a real mandate requires the owner's signature.
 *
 * Projections are deliberately return-free. The contribution figures assume zero growth, because
 * presenting a projected return as a promise is exactly what this product must not do.
 */
import { buildMandateDraft, contributionGapForDraft, type InterviewAnswers } from "@/lib/scenarios";
import { getServerContext } from "@/lib/server";
import { readUniverse } from "@/lib/universe";
import { errorResponse, jsonResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  let body: { base?: InterviewAnswers; changes?: Partial<InterviewAnswers> };
  try {
    body = (await request.json()) as typeof body;
    if (!body.base) throw new Error("`base` interview answers are required");
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Invalid request body");
  }

  try {
    const { client, deployment, deployed } = await getServerContext();
    if (!deployed) return errorResponse("Modalis is not deployed on this chain yet.", 503);

    const universe = await readUniverse(client, deployment);
    const now = new Date();

    const base = buildMandateDraft(body.base, universe, { now });
    const changed = buildMandateDraft({ ...body.base, ...(body.changes ?? {}) }, universe, { now });

    return jsonResponse({
      base: { draft: base, funding: contributionGapForDraft(body.base, base) },
      changed: { draft: changed, funding: contributionGapForDraft({ ...body.base, ...(body.changes ?? {}) }, changed) },
      disclaimer:
        "Funding figures assume zero investment growth and are not a projection of returns. " +
        "Modalis does not promise a return.",
    });
  } catch (err) {
    return errorResponse(err instanceof Error ? err.message : "Could not run the scenario", 422);
  }
}
