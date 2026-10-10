/**
 * Activity: the story of what has happened.
 *
 * Two sources, and the difference matters.
 *
 *  - The CHAIN records everything that succeeded. It cannot record what was refused, because a
 *    refused action reverts and emits nothing.
 *  - The DATABASE records what Modalis suggested, including the suggestions the person's rules
 *    turned down. That record exists nowhere else.
 *
 * So a complete history needs both, and the result says which parts came from where rather than
 * implying a single omniscient log.
 */
import { fetchActivity, type Deployment } from "@modalis/chain";
import { recentProposals, recentTransactions, type ModalisClient } from "@modalis/db";
import { getAddress, type Address } from "viem";
import type { DomainContext } from "../context.ts";
import { displayName, toReceipt } from "../translate.ts";
import { money, type ActivityItem, type ActivityKind } from "../models.ts";

/** Chain event name -> what the person reads. */
const EVENT_TITLES: Record<string, { kind: ActivityKind; title: string }> = {
  Deposited: { kind: "money_added", title: "Money added" },
  Withdrawn: { kind: "money_withdrawn", title: "Money withdrawn" },
  Rebalanced: { kind: "adjustment_made", title: "Plan adjusted" },
  MandateActiveSet: { kind: "plan_changed", title: "Plan changed" },
  // TradeSettled is the same action as Rebalanced seen from the other side; showing both would
  // report one adjustment twice.
};

export type ActivityFeed = {
  items: ActivityItem[];
  /** Where this came from, so the UI never implies history it does not have. */
  sources: { chain: boolean; recommendations: boolean };
};

export async function getActivity(
  ctx: DomainContext,
  owner: Address,
  options: { planId?: string | null } = {},
): Promise<ActivityFeed> {
  const who = getAddress(owner);
  const items: ActivityItem[] = [];

  // --- What actually happened, from the chain: the Envio indexer when there is one (instant, with
  //     real timestamps), RPC log queries otherwise or if the indexer doesn't answer.
  let chainOk = false;
  const indexed = ctx.envioUrl ? await fromEnvio(ctx.envioUrl, who, ctx.explorerUrl).catch(() => null) : null;
  if (indexed) {
    items.push(...indexed);
    chainOk = true;
  } else try {
    const events = await fetchActivity(ctx.client, ctx.deployment, who);
    chainOk = true;
    for (const event of events) {
      const mapped = EVENT_TITLES[event.kind];
      if (!mapped) continue;
      items.push({
        id: `${event.txHash}-${event.logIndex}`,
        kind: mapped.kind,
        title: mapped.title,
        detail: detailFor(event.kind, event.args),
        at: new Date().toISOString(), // refined below when the indexer supplies a timestamp
        receipt: toReceipt(event.txHash, true, ctx.explorerUrl),
      });
    }
  } catch {
    // A chain read failure must not blank the whole history; the database half can still show.
    chainOk = false;
  }

  // --- What Modalis suggested, including what the rules refused.
  let recommendationsOk = false;
  if (ctx.db && options.planId) {
    const proposals = await recentProposals(ctx.db, options.planId);
    recommendationsOk = true;
    for (const p of proposals) {
      const refused = p.status === "rejected" || p.status === "failed";
      // A successful adjustment is already in the chain half; only add what the chain cannot show.
      if (!refused && p.status !== "proposed") continue;
      items.push({
        id: `proposal-${p.id}`,
        kind: refused ? "adjustment_blocked" : "checkup",
        title: refused ? "Adjustment stopped by your rules" : "Adjustment suggested",
        detail: refused
          ? `Modalis suggested a change and your rules didn't allow it, so nothing moved.${p.revert_reason ? ` (${p.revert_reason})` : ""}`
          : p.reason,
        at: p.created_at,
      });
    }
  }

  items.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
  return { items, sources: { chain: chainOk, recommendations: recommendationsOk } };
}

/** Envio's GraphQL types for the two entities the feed needs. */
type EnvioTx = { id: string; type: string; txHash: string; timestamp: string };
type EnvioRebalance = { id: string; txHash: string; timestamp: string };

const ENVIO_KIND: Record<string, string> = {
  DEPOSIT: "Deposited",
  WITHDRAW: "Withdrawn",
  EMERGENCY_WITHDRAW: "Withdrawn",
};

/**
 * Reads the owner's settled history from the hosted indexer (integrations/envio). Returns null on
 * anything unexpected so the caller falls back to reading the chain directly.
 */
async function fromEnvio(url: string, owner: Address, explorerUrl?: string): Promise<ActivityItem[] | null> {
  const query = `query ($owner: String!) {
    Transaction(where: { owner_id: { _eq: $owner } }, order_by: { blockNumber: desc }, limit: 200) { id type txHash timestamp }
    Rebalance(where: { owner_id: { _eq: $owner } }, order_by: { blockNumber: desc }, limit: 200) { id txHash timestamp }
  }`;
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ query, variables: { owner: owner.toLowerCase() } }),
    signal: AbortSignal.timeout(4_000),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { data?: { Transaction?: EnvioTx[]; Rebalance?: EnvioRebalance[] }; errors?: unknown };
  if (body.errors || !body.data?.Transaction || !body.data?.Rebalance) return null;

  const at = (ts: string) => new Date(Number(ts) * 1000).toISOString();
  const out: ActivityItem[] = [];
  for (const t of body.data.Transaction) {
    const kind = ENVIO_KIND[t.type];
    if (!kind) continue;
    const mapped = EVENT_TITLES[kind];
    out.push({ id: t.id, kind: mapped.kind, title: mapped.title, detail: detailFor(kind, {}), at: at(t.timestamp), receipt: toReceipt(t.txHash, true, explorerUrl) });
  }
  for (const r of body.data.Rebalance) {
    const mapped = EVENT_TITLES.Rebalanced;
    out.push({ id: r.id, kind: mapped.kind, title: mapped.title, detail: detailFor("Rebalanced", {}), at: at(r.timestamp), receipt: toReceipt(r.txHash, true, explorerUrl) });
  }
  return out;
}

function detailFor(kind: string, args: Record<string, unknown>): string {
  switch (kind) {
    case "Deposited":
      return "You added money to your plan.";
    case "Withdrawn":
      return "You took money out of your plan.";
    case "Rebalanced":
      return "Modalis moved money between investments to bring your plan back on target.";
    case "MandateActiveSet":
      return args.active === false ? "You paused your plan." : "You resumed your plan.";
    default:
      return "";
  }
}

export { money, displayName };
export type { Deployment, ModalisClient };
