/**
 * The off-chain half of the risk signal: how hard the market is moving right now.
 *
 * Each DON node fetches the same public price API on its own (CRE's HTTP capability), turns the
 * reply into one integer, and the DON takes the median, so one node seeing a stale or doctored
 * reply can't move the result. The number is "market stress" in basis points: the largest
 * absolute 24-hour price move among the watched assets.
 *
 * Pure functions only, so they can be tested without the CRE runtime.
 */

export type MarketConfig = {
  /** A JSON endpoint in CoinGecko's /simple/price shape, with include_24hr_change=true. */
  url: string;
  /** The ids to read from the reply, e.g. ["bitcoin", "ethereum"]. */
  ids: string[];
  /** At or above this stress, a portfolio that is otherwise OK is flagged DRIFT for review. */
  stressBps: number;
};

/**
 * Largest absolute 24h move among `ids`, in basis points, from a CoinGecko-shaped reply:
 * { "bitcoin": { "usd": 64000, "usd_24h_change": -3.2 }, ... }. Ids missing from the reply are
 * ignored; a reply with none of them throws, so a broken feed fails loudly instead of reading as
 * a calm market.
 */
export function marketStressBps(reply: unknown, ids: string[]): number {
  if (!reply || typeof reply !== "object") throw new Error("Market feed returned no data");
  const moves: number[] = [];
  for (const id of ids) {
    const entry = (reply as Record<string, Record<string, unknown>>)[id];
    const change = entry?.usd_24h_change;
    if (typeof change === "number" && Number.isFinite(change)) moves.push(Math.abs(change));
  }
  if (moves.length === 0) throw new Error(`Market feed had none of: ${ids.join(", ")}`);
  return Math.round(Math.max(...moves) * 100);
}

export type CombinedStatus = { status: 0 | 1 | 2; reason: string };

/**
 * Combines the on-chain verdict with market stress. Stress can only raise OK to DRIFT (a prompt
 * to review), never cause a BREACH and never lower a verdict: the limits themselves are judged
 * from chain state alone.
 */
export function combineWithMarket(
  onchain: CombinedStatus,
  stressBps: number | null,
  thresholdBps: number,
): CombinedStatus {
  if (stressBps === null) return onchain;
  const tag = `MARKET:${stressBps}/${thresholdBps}`;
  if (onchain.status === 0 && stressBps >= thresholdBps) return { status: 1, reason: `${tag},${onchain.reason}` };
  return { status: onchain.status, reason: `${onchain.reason},${tag}` };
}
