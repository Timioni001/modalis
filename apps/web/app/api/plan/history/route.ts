/** GET /api/plan/history — every version of the person's plan, newest first, and why. */
import { getPlanHistory } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    return jsonResponse(await getPlanHistory(await domainContext(), owner));
  });
}
