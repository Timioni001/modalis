/**
 * Proposals, transactions, risk events, explanations and portfolio snapshots.
 *
 * All service-role writes. Two of these are the reason the database exists at all:
 *
 *  - A REJECTED proposal leaves no trace on-chain, because the transaction reverts and emits
 *    nothing. If it is not recorded here it is not recorded anywhere, so the record that the
 *    mandate refused an action lives in this table and nowhere else.
 *  - An EXPLANATION is prose. The chain stores only keccak256 of it, so the text has to live
 *    here, and `reason_hash` is what lets anyone check the stored text against what was
 *    committed on-chain.
 */
import type { ModalisClient } from "../client.ts";
import { tolerate } from "../errors.ts";
import type {
  ExplanationRow,
  Json,
  ProposalStatus,
  RebalanceProposalRow,
  RiskEventRow,
  RiskEventType,
  RiskSeverity,
  TransactionRow,
  TxStatus,
  TxType,
} from "../types.generated.ts";

const lower = (s: string) => s.toLowerCase();

// ------------------------------------------------------------------ proposals

export type ProposalInput = {
  mandateId: string;
  status: ProposalStatus;
  mandateVersion: number;
  nonce: string;
  adapterAddress: string;
  tokenIn: string;
  tokenOut: string;
  amountIn: string;
  minAmountOut: string;
  deadline: string; // ISO timestamp
  reason: string;
  reasonHash?: string;
  allocationBefore?: Json;
  allocationAfter?: Json;
  revertReason?: string;
  /** True for the deliberate security demonstration, so it is never mistaken for a real action. */
  isDemoInvalid?: boolean;
};

export async function recordProposal(
  db: ModalisClient,
  input: ProposalInput,
): Promise<RebalanceProposalRow | null> {
  return tolerate("recordProposal", async () => {
    const { data, error } = await db
      .from("rebalance_proposals")
      .upsert(
        {
          mandate_id: input.mandateId,
          status: input.status,
          mandate_version: input.mandateVersion,
          nonce: input.nonce,
          adapter_address: lower(input.adapterAddress),
          token_in: lower(input.tokenIn),
          token_out: lower(input.tokenOut),
          amount_in: input.amountIn,
          min_amount_out: input.minAmountOut,
          deadline: input.deadline,
          reason: input.reason,
          reason_hash: input.reasonHash ?? null,
          allocation_before: input.allocationBefore ?? null,
          allocation_after: input.allocationAfter ?? null,
          revert_reason: input.revertReason ?? null,
          is_demo_invalid: input.isDemoInvalid ?? false,
        },
        // The schema keys uniqueness on (mandate_id, nonce, is_demo_invalid): a nonce is reused
        // after a rejected proposal, because a reverted transaction does not consume it.
        { onConflict: "mandate_id,nonce,is_demo_invalid" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function markProposal(
  db: ModalisClient,
  proposalId: string,
  status: ProposalStatus,
  extra: { revertReason?: string; executedAt?: string } = {},
): Promise<void> {
  await tolerate("markProposal", async () => {
    const { error } = await db
      .from("rebalance_proposals")
      .update({
        status,
        ...(extra.revertReason ? { revert_reason: extra.revertReason } : {}),
        ...(extra.executedAt ? { executed_at: extra.executedAt } : {}),
      })
      .eq("id", proposalId);
    if (error) throw error;
  });
}

export async function recentProposals(
  db: ModalisClient,
  mandateId: string,
  limit = 20,
): Promise<RebalanceProposalRow[]> {
  const rows = await tolerate("recentProposals", async () => {
    const { data, error } = await db
      .from("rebalance_proposals")
      .select()
      .eq("mandate_id", mandateId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  });
  return rows ?? [];
}

// --------------------------------------------------------------- transactions

export type TransactionInput = {
  userId: string;
  mandateId?: string;
  proposalId?: string;
  txHash: string;
  type: TxType;
  status: TxStatus;
  chainId: number;
  blockNumber?: string;
  venue?: string;
  details?: Json;
};

export async function recordTransaction(
  db: ModalisClient,
  input: TransactionInput,
): Promise<TransactionRow | null> {
  return tolerate("recordTransaction", async () => {
    const { data, error } = await db
      .from("transactions")
      .upsert(
        {
          user_id: input.userId,
          mandate_id: input.mandateId ?? null,
          proposal_id: input.proposalId ?? null,
          // The schema's CHECK accepts either case; keep the hash exactly as the node returned it.
          tx_hash: input.txHash,
          type: input.type,
          status: input.status,
          chain_id: input.chainId,
          block_number: input.blockNumber ?? null,
          venue: input.venue ?? null,
          details: input.details ?? {},
          ...(input.status === "confirmed" ? { confirmed_at: new Date().toISOString() } : {}),
        },
        { onConflict: "tx_hash" },
      )
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function recentTransactions(
  db: ModalisClient,
  userId: string,
  limit = 50,
): Promise<TransactionRow[]> {
  const rows = await tolerate("recentTransactions", async () => {
    const { data, error } = await db
      .from("transactions")
      .select()
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  });
  return rows ?? [];
}

// ---------------------------------------------------------------- risk events

export type RiskEventInput = {
  mandateId: string;
  type: RiskEventType;
  severity: RiskSeverity;
  details?: Json;
  /** 'chainlink-cre' when the signal carried DON consensus, otherwise 'risk-monitor'. */
  source?: string;
  txHash?: string;
};

export async function recordRiskEvent(
  db: ModalisClient,
  input: RiskEventInput,
): Promise<RiskEventRow | null> {
  return tolerate("recordRiskEvent", async () => {
    const { data, error } = await db
      .from("risk_events")
      .insert({
        mandate_id: input.mandateId,
        type: input.type,
        severity: input.severity,
        details: input.details ?? {},
        source: input.source ?? "risk-monitor",
        tx_hash: input.txHash ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

export async function recentRiskEvents(
  db: ModalisClient,
  mandateId: string,
  limit = 20,
): Promise<RiskEventRow[]> {
  const rows = await tolerate("recentRiskEvents", async () => {
    const { data, error } = await db
      .from("risk_events")
      .select()
      .eq("mandate_id", mandateId)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw error;
    return data;
  });
  return rows ?? [];
}

// --------------------------------------------------------------- explanations

export async function recordExplanation(
  db: ModalisClient,
  input: { mandateId: string; proposalId?: string; riskEventId?: string; body: string; model?: string },
): Promise<ExplanationRow | null> {
  return tolerate("recordExplanation", async () => {
    const { data, error } = await db
      .from("explanations")
      .insert({
        mandate_id: input.mandateId,
        proposal_id: input.proposalId ?? null,
        risk_event_id: input.riskEventId ?? null,
        body: input.body,
        model: input.model ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data;
  });
}

// ------------------------------------------------------------------ snapshots

export type SnapshotInput = {
  mandateId: string;
  blockNumber?: string;
  /** USD, decimal string. */
  totalValue: string;
  riskScore?: number;
  goalProgress?: number;
  liquidityBps?: number;
  maxDriftBps?: number;
  positions: {
    tokenAddress: string;
    symbol: string;
    /** uint256 base units, as a decimal string. */
    amount: string;
    value: string;
    allocationBps: number;
  }[];
};

/**
 * A point-in-time cache of portfolio state, for charting progress over time. Live state always
 * comes from the chain; this is history, so a stale snapshot is never shown as current.
 */
export async function recordSnapshot(db: ModalisClient, input: SnapshotInput): Promise<string | null> {
  return tolerate("recordSnapshot", async () => {
    const { data: snapshot, error } = await db
      .from("portfolio_snapshots")
      .insert({
        mandate_id: input.mandateId,
        block_number: input.blockNumber ?? null,
        total_value: input.totalValue,
        // numeric columns: stringify at the boundary rather than letting a float be serialised.
        risk_score: input.riskScore === undefined ? null : String(input.riskScore),
        goal_progress: input.goalProgress === undefined ? null : String(input.goalProgress),
        liquidity_bps: input.liquidityBps ?? null,
        max_drift_bps: input.maxDriftBps ?? null,
      })
      .select("id")
      .single();
    if (error) throw error;

    if (input.positions.length > 0) {
      const { error: posError } = await db.from("positions").insert(
        input.positions.map((p) => ({
          snapshot_id: snapshot.id,
          token_address: p.tokenAddress.toLowerCase(),
          symbol: p.symbol,
          amount: p.amount,
          value: p.value,
          allocation_bps: p.allocationBps,
        })),
      );
      if (posError) throw posError;
    }
    return snapshot.id;
  });
}
