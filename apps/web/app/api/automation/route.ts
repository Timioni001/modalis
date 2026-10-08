/**
 * GET  /api/automation — how much Modalis may do without asking, and any change still waiting.
 * POST /api/automation — ask for a level. Raising it waits; lowering it is immediate.
 *
 * The level is written by the server only (RLS refuses the browser), so the timelock cannot be
 * skipped by writing the row directly.
 */
import { automationFor, setAutomation } from "@modalis/domain";
import { domainContext, jsonResponse, rateLimit, readBody, requireOwner, route } from "@/lib/api";
import { oneOf } from "@/lib/validate";

export const dynamic = "force-dynamic";

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const owner = await requireOwner(request);
    return jsonResponse({ automation: await automationFor(await domainContext(), owner) });
  });
}

export async function POST(request: Request): Promise<Response> {
  return route(async () => {
    await rateLimit(request, "automation:set", { max: 10, windowMs: 60_000 });
    const owner = await requireOwner(request);
    const level = oneOf((await readBody(request)).level, "a level", ["guided", "assisted", "automated"] as const);
    return jsonResponse({ automation: await setAutomation(await domainContext(), owner, level) });
  });
}
