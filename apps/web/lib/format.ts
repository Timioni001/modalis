/**
 * Display formatting.
 *
 * The domain layer hands this app money as a decimal STRING and percentages as plain numbers, so
 * nothing here has to know about 1e18 fixed point or basis points. Money is only ever converted
 * to a float for display, never for arithmetic — the string carries the precision.
 */
import type { Money } from "@modalis/domain";

/** A domain Money -> "$11,031.67". */
export function moneyLabel(value: Money | undefined, decimals = 2): string {
  if (!value) return "—";
  return usdFromDecimal(value.amount, decimals);
}

/** A decimal string of dollars -> "$11,031.67". */
export function usdFromDecimal(amount: string, decimals = 2): string {
  const n = Number(amount);
  if (!Number.isFinite(n)) return `$${amount}`;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/** Compact for headline figures: "$1.2M", "$24,500". */
export function moneyCompact(value: Money | undefined): string {
  if (!value) return "—";
  const n = Number(value.amount);
  if (!Number.isFinite(n)) return `$${value.amount}`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1_000_000).toLocaleString("en-US", { maximumFractionDigits: 1 })}M`;
  if (Math.abs(n) >= 10_000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  return usdFromDecimal(value.amount);
}

/** A percentage number -> "30%" or "32.7%". Trailing ".0" is noise, so it is dropped. */
export function percent(value: number, decimals?: number): string {
  if (decimals !== undefined) return `${value.toFixed(decimals)}%`;
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

export function signedPercent(value: number): string {
  const text = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return value > 0 ? `+${text}%` : `${text}%`;
}

export function shortAddress(address: string): string {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

/** A receipt reference, shortened. The word "hash" never reaches a person. */
export function shortReference(reference: string): string {
  return `${reference.slice(0, 10)}…${reference.slice(-8)}`;
}

export function monthsToHuman(months: number): string {
  if (months < 12) return `${months} month${months === 1 ? "" : "s"}`;
  const years = Math.floor(months / 12);
  const rest = months % 12;
  const y = `${years} year${years === 1 ? "" : "s"}`;
  return rest === 0 ? y : `${y}, ${rest} month${rest === 1 ? "" : "s"}`;
}

/** An ISO date -> "March 2029". */
export function monthYear(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

/** An ISO timestamp -> "Mar 4, 09:21". */
export function whenLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
