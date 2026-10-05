/**
 * GET /api/adjustment — does my plan need a change, and what does Modalis suggest?
 *
 * Read-only. The suggestion is simulated against live chain state before it is returned, so the
 * person is told whether their own rules permit it BEFORE being asked to approve anything. A
 * suggestion the rules refuse comes back with allowedByYourRules: false and an explanation —
 * that is the protection working, not a failure.
 */
import { recommendAdjustment } from "@modalis/domain";
import { domainContext, jsonResponse, requireOwner, route } from "@/lib/api";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    const ctx = await domainContext();
    return jsonResponse({ adjustment: await recommendAdjustment(ctx, owner) });
  });
}
