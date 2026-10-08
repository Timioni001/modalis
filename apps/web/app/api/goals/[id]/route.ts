/**
 * PATCH /api/goals/:id — change one of the person's goals.
 *
 * The id comes from the path, the owner from the session; the repository matches both, so an id
 * belonging to someone else simply finds nothing. The plan's own goal refuses target/date edits:
 * those are a plan change, signed on-chain.
 */
import { editGoal } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { uuid } from "@/lib/validate";
import { goalPatchFrom } from "../shared";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "goals:edit", { max: 30, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const id = uuid((await params).id, "that goal");
    const patch = goalPatchFrom(await readBody(request));
    return jsonResponse(await editGoal(await domainContext(), owner, id, patch));
  });
}
