/**
 * Taking money out (§23, §24).
 *
 * The mirror of the contribution router. A withdrawal comes first from whatever is ABOVE the
 * plan's target after the withdrawal, so taking money out moves the portfolio back toward plan
 * instead of further from it. If the over-target excess is not enough, the rest is taken in
 * proportion to what each holding has, so nothing is drained to zero for the sake of it.
 *
 * It also answers the question the person needs before they sign: does what is left still keep
 * the money your plan says must stay easy to withdraw? It does not refuse — the money is theirs,
 * and the contract lets the owner withdraw at any time, even while paused — but it says so.
 *
 * bigint at 1e18; the parts always add up to exactly the amount asked for.
 */
export type WithdrawHolding = {
  id: string;
  valueE18: bigint;
  targetBps: number;
  /** Counts toward "kept available". */
  isLiquid: boolean;
};

export type WithdrawalSplit = {
  parts: { id: string; amountE18: bigint }[];
  /** Share kept easy to withdraw, before and after, in bps. */
  availableBpsBefore: number;
  availableBpsAfter: number;
  /** False when what remains keeps less available than the plan's floor. */
  keepsAvailableFloor: boolean;
};

const bps = (part: bigint, whole: bigint) => (whole === 0n ? 0 : Number((part * 10_000n) / whole));

export function planWithdrawal(
  holdings: WithdrawHolding[],
  amountE18: bigint,
  minAvailableBps: number,
): WithdrawalSplit {
  const total = holdings.reduce((s, h) => s + h.valueE18, 0n);
  if (amountE18 <= 0n) throw new RangeError("amount must be positive");
  if (amountE18 > total) throw new RangeError("amount exceeds holdings");

  const after = total - amountE18;
  const excess = holdings.map((h) => {
    const aim = (after * BigInt(h.targetBps)) / 10_000n;
    return h.valueE18 > aim ? h.valueE18 - aim : 0n;
  });
  const totalExcess = excess.reduce((a, b) => a + b, 0n);

  let parts: bigint[];
  if (totalExcess >= amountE18 && totalExcess > 0n) {
    parts = excess.map((e) => (amountE18 * e) / totalExcess);
  } else {
    const rest = amountE18 - totalExcess;
    const remaining = holdings.map((h, i) => h.valueE18 - excess[i]);
    const remainingTotal = remaining.reduce((a, b) => a + b, 0n);
    parts = holdings.map((_, i) => excess[i] + (remainingTotal === 0n ? 0n : (rest * remaining[i]) / remainingTotal));
  }

  // Dust from integer division goes to the largest part that still has room.
  let dust = amountE18 - parts.reduce((a, b) => a + b, 0n);
  const order = parts.map((_, i) => i).sort((a, b) => (parts[b] > parts[a] ? 1 : -1));
  for (const i of order) {
    if (dust === 0n) break;
    const room = holdings[i].valueE18 - parts[i];
    const take = dust < room ? dust : room;
    parts[i] += take;
    dust -= take;
  }

  const liquidBefore = holdings.filter((h) => h.isLiquid).reduce((s, h) => s + h.valueE18, 0n);
  const liquidAfter = holdings.reduce((s, h, i) => (h.isLiquid ? s + h.valueE18 - parts[i] : s), 0n);
  const availableBpsAfter = bps(liquidAfter, after);

  return {
    parts: holdings.map((h, i) => ({ id: h.id, amountE18: parts[i] })),
    availableBpsBefore: bps(liquidBefore, total),
    availableBpsAfter,
    keepsAvailableFloor: after === 0n || availableBpsAfter >= minAvailableBps,
  };
}
