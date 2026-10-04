/**
 * Display formatting.
 *
 * Money is bigint USD at 1e18 everywhere in the system, and is only ever converted to a string
 * here — never to a float for arithmetic. Percentages come in as integer bps.
 */
import { formatUnits } from "viem";

export function usd(valueE18: bigint, opts: { decimals?: number; compact?: boolean } = {}): string {
  const n = Number(formatUnits(valueE18, 18));
  if (opts.compact && Math.abs(n) >= 10_000) {
    return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
  const d = opts.decimals ?? 2;
  return `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
}

/** bps -> "32.7%". One decimal is the right resolution for an allocation. */
export function pct(bps: number, decimals = 1): string {
  return `${(bps / 100).toFixed(decimals)}%`;
}

/** bps -> "30%" for round policy numbers like a cap or a floor. */
export function pctRound(bps: number): string {
  return `${Math.round(bps / 100)}%`;
}

export function signedPct(bps: number): string {
  const s = (bps / 100).toFixed(1);
  return bps > 0 ? `+${s}%` : `${s}%`;
}

export function tokenAmount(amount: bigint, decimals: number, maxFractionDigits = 6): string {
  const n = Number(formatUnits(amount, decimals));
  return n.toLocaleString("en-US", { maximumFractionDigits: maxFractionDigits });
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}…${hash.slice(-8)}`;
}

export function monthsToHuman(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? y : `${y}, ${rest} month${rest === 1 ? "" : "s"}`;
}

export function targetDateLabel(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** Accepts the string form too, since GraphQL returns BigInt scalars as strings. */
export function timestampLabel(unixSeconds: number | bigint | string): string {
  return new Date(Number(unixSeconds) * 1000).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
