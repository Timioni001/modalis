/** GET /api/notifications — the person's own notifications, newest first. */
import { getNotifications } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    return jsonResponse(await getNotifications(await domainContext(), owner));
  });
}
