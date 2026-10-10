/**
 * Public activity counts from the hosted Envio indexer (integrations/envio), for /stats.
 *
 * Envio reads every Modalis event from Monad itself, so these counts include everything that
 * settled on-chain, not only what this server recorded. Returns null on anything unexpected so the
 * page falls back to the database counts.
 */

export type EnvioStats = {
  plans: number;
  transactionsThisWeek: number;
  adjustmentsThisWeek: number;
  recent: { hash: string; type: string; at: string }[];
};

/** Results are capped per query; a count at the cap is shown as "at least". */
export const ENVIO_LIMIT = 1000;

export function envioStatsQuery(sinceSeconds: number): string {
  const since = Math.floor(sinceSeconds);
  return `{
    plans: User(where: { currentMandateVersion: { _gt: 0 } }, limit: ${ENVIO_LIMIT}) { id }
    week: Transaction(where: { timestamp: { _gte: "${since}" } }, limit: ${ENVIO_LIMIT}) { type }
    recent: Transaction(order_by: { blockNumber: desc }, limit: 8) { txHash type timestamp }
  }`;
}

type Reply = {
  data?: {
    plans?: { id: string }[];
    week?: { type: string }[];
    recent?: { txHash: string; type: string; timestamp: string }[];
  };
  errors?: unknown;
};

export function parseEnvioStats(body: unknown): EnvioStats | null {
  const r = body as Reply;
  if (!r || r.errors || !r.data?.plans || !r.data.week || !r.data.recent) return null;
  return {
    plans: r.data.plans.length,
    transactionsThisWeek: r.data.week.length,
    adjustmentsThisWeek: r.data.week.filter((t) => t.type === "REBALANCE").length,
    recent: r.data.recent.map((t) => ({
      hash: t.txHash,
      type: t.type.toLowerCase(),
      at: new Date(Number(t.timestamp) * 1000).toISOString(),
    })),
  };
}

export async function fetchEnvioStats(url: string, now = Date.now()): Promise<EnvioStats | null> {
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ query: envioStatsQuery(now / 1000 - 7 * 86_400) }),
      signal: AbortSignal.timeout(4_000),
    });
    if (!res.ok) return null;
    return parseEnvioStats(await res.json());
  } catch {
    return null;
  }
}
