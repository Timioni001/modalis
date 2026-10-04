/**
 * Shared helpers for the Modalis handlers.
 *
 * Ids are deterministic and collision-free so a reorg replay overwrites the same row rather than
 * duplicating it: event rows key off txHash + logIndex, and state rows off their natural key.
 */
import type { EvmOnEventContext } from "envio";

export const lower = (a: string): string => a.toLowerCase();

export const eventId = (txHash: string, logIndex: number): string => `${lower(txHash)}-${logIndex}`;
export const mandateId = (owner: string, version: number | bigint): string => `${lower(owner)}-${version}`;
export const allocationId = (owner: string, version: number | bigint, token: string): string =>
  `${mandateId(owner, version)}-${lower(token)}`;
export const positionId = (owner: string, token: string): string => `${lower(owner)}-${lower(token)}`;
export const rebalanceId = (owner: string, nonce: bigint): string => `${lower(owner)}-${nonce}`;

export const RISK_STATUS = ["OK", "DRIFT", "BREACH"] as const;
export type RiskStatusName = (typeof RISK_STATUS)[number];

export function riskStatusName(status: number | bigint): RiskStatusName {
  const i = Number(status);
  return RISK_STATUS[i] ?? "OK";
}

/** Progress toward the goal in bps, integer-only so no float is ever stored. */
export function progressBps(totalValue: bigint, targetValue: bigint): number {
  if (targetValue === 0n) return 0;
  return Number((totalValue * 10_000n) / targetValue);
}

type Ctx = EvmOnEventContext;

/**
 * Loads the owner row, creating it on first sight. Every handler funnels through this so a user
 * always exists before anything references it, whichever event arrives first.
 */
export async function touchUser(
  context: Ctx,
  owner: string,
  blockNumber: bigint,
): Promise<{ id: string; manager: string | undefined; currentMandateVersion: number }> {
  const id = lower(owner);
  const existing = await context.User.get(id);
  if (existing) {
    context.User.set({ ...existing, lastActivityBlock: blockNumber });
    return {
      id,
      manager: existing.manager ?? undefined,
      currentMandateVersion: existing.currentMandateVersion,
    };
  }
  const created = {
    id,
    manager: undefined,
    currentMandateVersion: 0,
    firstSeenBlock: blockNumber,
    lastActivityBlock: blockNumber,
  };
  context.User.set(created);
  return { id, manager: undefined, currentMandateVersion: 0 };
}

/** Applies a signed delta to a position, creating it if needed. */
export async function applyPositionDelta(
  context: Ctx,
  owner: string,
  token: string,
  delta: bigint,
  blockNumber: bigint,
): Promise<void> {
  const id = positionId(owner, token);
  const existing = await context.Position.get(id);
  const next = (existing?.amount ?? 0n) + delta;
  context.Position.set({
    id,
    owner_id: lower(owner),
    token: lower(token),
    // A position should never go negative; clamp rather than store a nonsensical balance, and
    // the vault's own accounting is the source of truth regardless.
    amount: next < 0n ? 0n : next,
    lastUpdatedBlock: blockNumber,
  });
}
