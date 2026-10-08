/** POST /api/goals/order — set funding priority: the first id is funded first. */
import { reorderGoals } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { InvalidRequest, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "goals:order", { max: 20, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const body = await readBody(request);
    if (!Array.isArray(body.order) || body.order.length === 0 || body.order.length > 12) {
      throw new InvalidRequest("We need the goals in their new order.");
    }
    const order = body.order.map((id) => uuid(id, "a goal"));
    return jsonResponse(await reorderGoals(await domainContext(), owner, order));
  });
}
