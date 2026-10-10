/**
 * "What if the market drops 30%?" — applied to the person's real holdings, as read from the chain.
 *
 * Arithmetic only, and stated plainly: every holding that isn't kept available (cash) falls by the
 * chosen amount at once; cash doesn't move. That is a deliberately blunt shock, not a forecast. The
 * answer is what the plan's own limits would then say: how much the money would fall, whether that
 * is past the drop the person said they could live with, and which holdings would end up outside
 * their range so that Modalis would suggest an adjustment.
 */
export type StressPosition = {
  symbol: string;
  isLiquid: boolean;
  valueE18: bigint;
  minBps: number;
  maxBps: number;
};

export type StressResult = {
  dropBps: number;
  beforeE18: bigint;
  afterE18: bigint;
  lossE18: bigint;
  /** Fall of the whole plan, in bps (smaller than dropBps when part is in cash). */
  planFallBps: number;
  pastDrawdownLimit: boolean;
  liquidityAfterBps: number;
  belowLiquidityFloor: boolean;
  outsideRange: { symbol: string; afterBps: number; minBps: number; maxBps: number }[];
};

const BPS = 10_000n;

export function stressTest(
  positions: StressPosition[],
  limits: { maxDrawdownBps: number; minLiquidityBps: number },
  dropBps: number,
): StressResult {
  const drop = BigInt(Math.max(0, Math.min(10_000, Math.round(dropBps))));
  const after = positions.map((p) => ({ ...p, afterE18: p.isLiquid ? p.valueE18 : (p.valueE18 * (BPS - drop)) / BPS }));
  const beforeE18 = positions.reduce((a, p) => a + p.valueE18, 0n);
  const afterE18 = after.reduce((a, p) => a + p.afterE18, 0n);
  const lossE18 = beforeE18 - afterE18;
  const share = (v: bigint) => (afterE18 === 0n ? 0 : Number((v * BPS) / afterE18));
  const planFallBps = beforeE18 === 0n ? 0 : Number((lossE18 * BPS) / beforeE18);
  const liquidityAfterBps = share(after.filter((p) => p.isLiquid).reduce((a, p) => a + p.afterE18, 0n));

  return {
    dropBps: Number(drop),
    beforeE18,
    afterE18,
    lossE18,
    planFallBps,
    pastDrawdownLimit: planFallBps > limits.maxDrawdownBps,
    liquidityAfterBps,
    belowLiquidityFloor: liquidityAfterBps < limits.minLiquidityBps,
    outsideRange: after
      .map((p) => ({ symbol: p.symbol, afterBps: share(p.afterE18), minBps: p.minBps, maxBps: p.maxBps }))
      .filter((p) => p.afterBps < p.minBps || p.afterBps > p.maxBps),
  };
}
