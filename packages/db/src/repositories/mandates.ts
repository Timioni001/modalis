/**
 * Mandates — a cache of on-chain policy, plus the "what changed?" history.
 *
 * These rows mirror `PortfolioMandate`, which remains the source of truth. They exist so the app
 * can show a user's policy history without replaying chain state, and so a past version can be
 * diffed against the next one.
 *
 * Written with the service role only. A user cannot insert a mandate row: the schema has no
 * insert policy for them, which the RLS checks assert adversarially.
 */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type { Json, MandateAllocationRow, MandateChangeRow, MandateRow } from "../types.generated.ts";

export type MandateAllocationInput = {
  tokenAddress: string;
  symbol: string;
  targetBps: number;
  minBps: number;
  maxBps: number;
  isLiquid: boolean;
};

export type MandateInput = {
  userId: string;
  /** Why this version exists, in the person's terms ("You raised your target"). §14. */
  reason?: string;
  goalId?: string;
  contractAddress: string;
  vaultAddress?: string;
  version: number;
  /** USD, 1e18 on-chain. Stored as a decimal string of whole USD. */
  targetValue: string;
  targetDate: string; // ISO timestamp
  maxDrawdownBps: number;
  minLiquidityBps: number;
  maxAssetBps: number;
  rebalanceThresholdBps: number;
  maxSlippageBps: number;
  managerAddress?: string;
  setTxHash?: string;
  allocations: MandateAllocationInput[];
};

const lower = (s?: string) => (s ? s.toLowerCase() : undefined);

/**
 * Records a mandate version and its allocations, and diffs it against the previous version.
 *
 * Idempotent on (user_id, contract_address, version), which is a unique key in the schema: the
 * same mandate observed twice does not create a second row.
 */
export async function recordMandate(
  db: ModalisClient,
  input: MandateInput,
): Promise<MandateRow | null> {
  return tolerate("recordMandate", async () => {
    const previous = await previousMandate(db, input.userId, input.version);

    const { data: mandate, error } = await db
      .from("mandates")
      .upsert(
        {
          user_id: input.userId,
          goal_id: input.goalId ?? null,
          contract_address: input.contractAddress.toLowerCase(),
          vault_address: lower(input.vaultAddress) ?? null,
          version: input.version,
          target_value: input.targetValue,
          target_date: input.targetDate,
          max_drawdown_bps: input.maxDrawdownBps,
          min_liquidity_bps: input.minLiquidityBps,
          max_asset_bps: input.maxAssetBps,
          rebalance_threshold_bps: input.rebalanceThresholdBps,
          max_slippage_bps: input.maxSlippageBps,
          manager_address: lower(input.managerAddress) ?? null,
          active: true,
          set_tx_hash: input.setTxHash ?? null,
          change_reason: input.reason ? input.reason.slice(0, 500) : null,
        },
        { onConflict: "user_id,contract_address,version" },
      )
      .select()
      .single();
    if (error) throw error;

    if (input.allocations.length > 0) {
      const { error: allocError } = await db.from("mandate_allocations").upsert(
        input.allocations.map((a) => ({
          mandate_id: mandate.id,
          token_address: a.tokenAddress.toLowerCase(),
          symbol: a.symbol,
          target_bps: a.targetBps,
          min_bps: a.minBps,
          max_bps: a.maxBps,
          is_liquid: a.isLiquid,
        })),
        { onConflict: "mandate_id,token_address" },
      );
      if (allocError) throw allocError;
    }

    // Older versions are superseded, so only the newest is active.
    await db
      .from("mandates")
      .update({ active: false })
      .eq("user_id", input.userId)
      .lt("version", input.version);

    if (previous) {
      const diff = diffMandates(previous, mandate);
      if (Object.keys(diff).length > 0) {
        await db.from("mandate_changes").insert({
          mandate_id: mandate.id,
          from_version: previous.version,
          to_version: mandate.version,
          diff: diff as Json,
        });
      }
    }

    return mandate;
  });
}

async function previousMandate(
  db: ModalisClient,
  userId: string,
  version: number,
): Promise<MandateRow | null> {
  const { data } = await db
    .from("mandates")
    .select()
    .eq("user_id", userId)
    .lt("version", version)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data ?? null;
}

/** The user-facing "what changed between v2 and v3?" record. */
export function diffMandates(from: MandateRow, to: MandateRow): Record<string, { from: unknown; to: unknown }> {
  const fields: (keyof MandateRow)[] = [
    "target_value",
    "target_date",
    "max_drawdown_bps",
    "min_liquidity_bps",
    "max_asset_bps",
    "rebalance_threshold_bps",
    "max_slippage_bps",
  ];
  const diff: Record<string, { from: unknown; to: unknown }> = {};
  for (const field of fields) {
    if (from[field] !== to[field]) diff[field] = { from: from[field], to: to[field] };
  }
  return diff;
}

export async function activeMandate(db: ModalisClient, userId: string): Promise<MandateRow | null> {
  return tolerate("activeMandate", async () => {
    const { data, error } = await db
      .from("mandates")
      .select()
      .eq("user_id", userId)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    return data;
  });
}

export async function mandateHistory(
  db: ModalisClient,
  userId: string,
): Promise<{ mandates: MandateRow[]; allocations: MandateAllocationRow[]; changes: MandateChangeRow[] }> {
  const result = await tolerate("mandateHistory", async () => {
    const { data: mandates, error } = await db
      .from("mandates")
      .select()
      .eq("user_id", userId)
      .order("version", { ascending: false });
    if (error) throw error;
    if (!mandates?.length) return { mandates: [], allocations: [], changes: [] };

    const ids = mandates.map((m) => m.id);
    const [{ data: allocations }, { data: changes }] = await Promise.all([
      db.from("mandate_allocations").select().in("mandate_id", ids),
      db.from("mandate_changes").select().in("mandate_id", ids).order("created_at", { ascending: false }),
    ]);
    return { mandates, allocations: allocations ?? [], changes: changes ?? [] };
  });
  return result ?? { mandates: [], allocations: [], changes: [] };
}
