/**
 * GET /api/ops/metrics — counters and latency for the operator.
 *
 * Not public: it answers only with `authorization: Bearer <OPS_METRICS_TOKEN>`, compared in
 * constant time. With no token configured the route does not exist (404), so an unconfigured
 * deployment exposes nothing. Counters hold no personal data — no addresses, no amounts.
 */
import { timingSafeEqual } from "node:crypto";
import { snapshot } from "@/lib/observe";
import { route } from "@/lib/api";

export const dynamic = "force-dynamic";

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export async function GET(request: Request): Promise<Response> {
  return route(async () => {
    const token = process.env.OPS_METRICS_TOKEN?.trim();
    if (!token || token.length < 24) return new Response("Not found", { status: 404 });
    const given = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "");
    if (!sameSecret(given, token)) return new Response("Not found", { status: 404 });
    return Response.json(snapshot(), { headers: { "cache-control": "no-store" } });
  });
}
