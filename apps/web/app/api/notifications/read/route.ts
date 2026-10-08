/** POST /api/notifications/read — mark the person's own notifications read. Other ids match nothing. */
import { readNotifications } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { InvalidRequest, uuid } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "notifications:read", { max: 60, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const body = await readBody(request);
    if (!Array.isArray(body.ids) || body.ids.length > 100) throw new InvalidRequest("We need a list of notifications.");
    const ids = body.ids.map((id) => uuid(id, "a notification"));
    return jsonResponse({ marked: await readNotifications(await domainContext(), owner, ids) });
  });
}
