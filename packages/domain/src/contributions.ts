/**
 * Where new money goes.
 *
 * The naive split — every holding gets its target share of the new money — keeps any drift that
 * is already there. If Bitcoin is above target and Cash below, splitting $1,000 by target buys
 * more Bitcoin, and the only way back on plan is a later sale: a fee, slippage, and a transaction
 * the person has to approve.
 *
 * So new money fills the holdings that are BELOW where the plan wants them first. Each holding's
 * aim is its target share of the portfolio AFTER the contribution; the gap to that aim is what it
 * can absorb. If the money covers every gap, the rest is split by target. If it doesn't, it is
 * shared across the gaps in proportion to their size, and anything already above target gets none.
 *
 * Every step reduces drift and none of it sells anything. With an empty plan every gap is exactly
 * the target share, so this reduces to the plain target split.
 *
 * All arithmetic is bigint at 1e18. A remainder from integer division goes to the largest share,
 * so the parts always add up to exactly what the person put in.
 */
export type RouterHolding = {
  id: string;
  /** What is held now, USD at 1e18. */
  valueE18: bigint;
  /** Where the plan wants it, in basis points of the whole. */
  targetBps: number;
};

export type Routed = { id: string; amountE18: bigint };

export function routeContribution(holdings: RouterHolding[], contributionE18: bigint): Routed[] {
  if (contributionE18 <= 0n || holdings.length === 0) return holdings.map((h) => ({ id: h.id, amountE18: 0n }));

  const current = holdings.reduce((sum, h) => sum + h.valueE18, 0n);
  const after = current + contributionE18;

  const gaps = holdings.map((h) => {
    const aim = (after * BigInt(h.targetBps)) / 10_000n;
    return aim > h.valueE18 ? aim - h.valueE18 : 0n;
  });
  const totalGap = gaps.reduce((a, b) => a + b, 0n);

  let parts: bigint[];
  if (totalGap === 0n) {
    parts = holdings.map((h) => (contributionE18 * BigInt(h.targetBps)) / 10_000n);
  } else if (contributionE18 <= totalGap) {
    parts = gaps.map((g) => (contributionE18 * g) / totalGap);
  } else {
    const rest = contributionE18 - totalGap;
    parts = holdings.map((h, i) => gaps[i] + (rest * BigInt(h.targetBps)) / 10_000n);
  }

  // Integer division leaves dust; give it to the largest part so the total is exact.
  const dust = contributionE18 - parts.reduce((a, b) => a + b, 0n);
  if (dust !== 0n) {
    let biggest = 0;
    for (let i = 1; i < parts.length; i++) if (parts[i] > parts[biggest]) biggest = i;
    parts[biggest] += dust;
  }

  return holdings.map((h, i) => ({ id: h.id, amountE18: parts[i] }));
}
