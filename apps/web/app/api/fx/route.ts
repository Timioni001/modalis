/**
 * GET /api/fx — today's exchange rates from US dollars, for showing amounts in local currency.
 *
 * Display only: plans are held and valued in dollars, and nothing is ever converted. Rates come
 * from open.er-api.com (free, no key), cached for six hours per instance. If they can't be fetched
 * the answer says so, and the app shows dollars alone rather than a stale or made-up figure.
 */
import { jsonResponse, route } from "@/lib/api";
import { errorResponse } from "@/lib/serialize";

export const dynamic = "force-dynamic";

const CURRENCIES = ["NGN", "GHS", "KES", "ZAR", "INR", "IDR", "BRL", "MXN", "EUR", "GBP"] as const;
const TTL_MS = 6 * 60 * 60 * 1000;
let cache: { at: number; body: unknown } | null = null;

export async function GET(): Promise<Response> {
  return route(async () => {
    if (cache && Date.now() - cache.at < TTL_MS) return jsonResponse(cache.body);
    try {
      const res = await fetch("https://open.er-api.com/v6/latest/USD", { signal: AbortSignal.timeout(5_000) });
      const data = (await res.json()) as { result?: string; rates?: Record<string, number>; time_last_update_utc?: string };
      if (data.result !== "success" || !data.rates) throw new Error("bad response");
      const rates = Object.fromEntries(CURRENCIES.filter((c) => data.rates![c]).map((c) => [c, data.rates![c]]));
      const body = { base: "USD", rates, updated: data.time_last_update_utc ?? null, source: "open.er-api.com" };
      cache = { at: Date.now(), body };
      return jsonResponse(body);
    } catch {
      return errorResponse("Exchange rates aren't available right now.", 503);
    }
  });
}
