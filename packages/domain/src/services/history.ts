/**
 * Plan history (§14): every approved version, why it exists, and what it changed.
 *
 * Built from the mandates table — one row per version the person signed — and the diffs recorded
 * between them. Each change is translated into the person's words; no field name, no basis point.
 */
import { getAddress, type Address } from "viem";
import { findUserByWallet, mandateHistory } from "@modalis/db";
import type { DomainContext } from "../context.ts";
import { moneyInSentence, money } from "../models.ts";

export type PlanVersion = {
  version: number;
  approvedAt: string;
  reason: string | null;
  receipt: string | null;
  changes: { label: string; from: string; to: string }[];
};

const LABELS: Record<string, { label: string; fmt: (v: unknown) => string }> = {
  target_value: { label: "Goal", fmt: (v) => moneyInSentence(money(String(v))) },
  target_date: { label: "Needed by", fmt: (v) => new Date(String(v)).toLocaleDateString("en-US", { month: "long", year: "numeric", timeZone: "UTC" }) },
  max_drawdown_bps: { label: "Most you'd lose", fmt: (v) => `${Number(v) / 100}%` },
  min_liquidity_bps: { label: "Kept available", fmt: (v) => `${Number(v) / 100}%` },
  max_asset_bps: { label: "Max in one thing", fmt: (v) => `${Number(v) / 100}%` },
  rebalance_threshold_bps: { label: "Steps in when off by", fmt: (v) => `${Number(v) / 100}%` },
  max_slippage_bps: { label: "Most price slip allowed", fmt: (v) => `${Number(v) / 100}%` },
};

export async function getPlanHistory(ctx: DomainContext, owner: Address): Promise<{ versions: PlanVersion[]; saved: boolean }> {
  if (!ctx.db) return { versions: [], saved: false };
  const user = await findUserByWallet(ctx.db, getAddress(owner));
  if (!user) return { versions: [], saved: true };

  const { mandates, changes } = await mandateHistory(ctx.db, user.id);
  const byTo = new Map(changes.map((c) => [c.mandate_id, c]));

  return {
    saved: true,
    versions: mandates.map((m) => {
      const diff = (byTo.get(m.id)?.diff ?? {}) as Record<string, { from: unknown; to: unknown }>;
      return {
        version: m.version,
        approvedAt: m.created_at,
        reason: m.change_reason ?? null,
        receipt: m.set_tx_hash ?? null,
        changes: Object.entries(diff)
          .filter(([k]) => LABELS[k])
          .map(([k, d]) => ({ label: LABELS[k].label, from: LABELS[k].fmt(d.from), to: LABELS[k].fmt(d.to) })),
      };
    }),
  };
}
