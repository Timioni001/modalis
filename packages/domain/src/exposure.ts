/**
 * What the money depends on (§11).
 *
 * The same holdings, grouped five ways: by investment, by kind, by issuer, by where trades are
 * carried out, and by risk. "How much of my money depends on crypto prices?" is a question about
 * risk factors, not investments, and it has a direct answer here.
 *
 * Built from live balances and the asset registry only. The venue is whatever this deployment
 * actually trades through, passed in — never assumed.
 */
import { assetMeta } from "./assets.ts";
import { moneyFromE18, type Money, type MoneyView } from "./models.ts";

export type ExposureLine = { label: string; value: Money; percent: number };
export type Exposure = {
  byInvestment: ExposureLine[];
  byKind: ExposureLine[];
  byIssuer: ExposureLine[];
  byVenue: ExposureLine[];
  byChain: ExposureLine[];
  /** A holding can carry several risks, so these percentages may sum past 100. */
  byRisk: ExposureLine[];
};

const KIND: Record<string, string> = { cash: "Cash", crypto: "Crypto", bond: "Bonds" };

function e18(amount: string): bigint {
  const [w, f = ""] = amount.split(".");
  return BigInt(w || "0") * 10n ** 18n + BigInt((f + "0".repeat(18)).slice(0, 18));
}

function group(entries: { key: string; valueE18: bigint }[], totalE18: bigint): ExposureLine[] {
  const sums = new Map<string, bigint>();
  for (const e of entries) sums.set(e.key, (sums.get(e.key) ?? 0n) + e.valueE18);
  return [...sums.entries()]
    .sort((a, b) => (b[1] > a[1] ? 1 : b[1] < a[1] ? -1 : 0))
    .map(([label, v]) => ({
      label,
      value: moneyFromE18(v),
      percent: totalE18 === 0n ? 0 : Number((v * 1000n) / totalE18) / 10,
    }));
}

export function exposureOf(money: MoneyView, venue: string): Exposure {
  const rows = money.holdings.map((h) => ({ meta: assetMeta(h.code), valueE18: e18(h.value.amount), cash: h.isAvailableCash }));
  const total = rows.reduce((s, r) => s + r.valueE18, 0n);
  return {
    byInvestment: group(rows.map((r) => ({ key: r.meta.name, valueE18: r.valueE18 })), total),
    byKind: group(rows.map((r) => ({ key: KIND[r.meta.type], valueE18: r.valueE18 })), total),
    byIssuer: group(rows.map((r) => ({ key: r.meta.issuer, valueE18: r.valueE18 })), total),
    // Cash is never traded to be held, so it depends on no venue.
    byVenue: group(rows.map((r) => ({ key: r.cash ? "None — held as cash" : venue, valueE18: r.valueE18 })), total),
    byChain: group(rows.map((r) => ({ key: r.meta.chain, valueE18: r.valueE18 })), total),
    byRisk: group(rows.flatMap((r) => r.meta.riskFactors.map((f) => ({ key: f, valueE18: r.valueE18 }))), total),
  };
}
