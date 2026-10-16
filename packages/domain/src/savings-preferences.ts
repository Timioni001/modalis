/** User-authored savings preferences. These do not change the vault's withdrawal permissions. */
export type SavingsPreferences = {
  /** USD per complete contribution, not per token transfer. Decimal string; cents supported. */
  minimumContribution: string;
  /** Personal waiting period after approving the plan, in calendar days. Zero means no wait. */
  minimumRetrievalDays: number;
  /** Optional context, kept as plain text. Never interpreted as a transaction instruction. */
  customDetails?: string;
};

export type SavingsSchedule = SavingsPreferences & {
  /** Actual approval block time. Absent on an unsigned draft. */
  startedAt?: string;
};

export const DEFAULT_SAVINGS_PREFERENCES: SavingsPreferences = {
  minimumContribution: "0.00",
  minimumRetrievalDays: 0,
};

/** Pure validation shared by the form and server. No floating point comparisons for money. */
export function contributionCents(input: string): bigint | null {
  if (!/^\d{1,12}(\.\d{1,2})?$/.test(input.trim())) return null;
  const [whole, fraction = ""] = input.trim().split(".");
  return BigInt(whole) * 100n + BigInt(fraction.padEnd(2, "0"));
}

export function savingsPreferenceProblem(input: unknown): string | null {
  if (!input || typeof input !== "object" || Array.isArray(input))
    return "Check your savings preferences.";
  const data = input as Record<string, unknown>;
  const cents =
    typeof data.minimumContribution === "string"
      ? contributionCents(data.minimumContribution)
      : null;
  if (cents === null || cents > 10_000_000n)
    return "Enter a minimum contribution from $0 to $100,000, with up to two decimal places.";
  if (
    typeof data.minimumRetrievalDays !== "number" ||
    !Number.isInteger(data.minimumRetrievalDays) ||
    data.minimumRetrievalDays < 0 ||
    data.minimumRetrievalDays > 3650
  )
    return "Enter a waiting period from 0 to 3,650 whole days.";
  if (
    data.customDetails !== undefined &&
    (typeof data.customDetails !== "string" || data.customDetails.length > 500)
  )
    return "Keep your custom savings details within 500 characters.";
  return null;
}

/** Stable representation for persistence. Call only after validation. Discards unknown fields. */
export function normaliseSavingsPreferences(
  input: SavingsPreferences,
): SavingsPreferences {
  const cents = contributionCents(input.minimumContribution)!;
  return {
    minimumContribution: `${cents / 100n}.${String(cents % 100n).padStart(2, "0")}`,
    minimumRetrievalDays: input.minimumRetrievalDays,
    ...(input.customDetails?.trim()
      ? { customDetails: input.customDetails.trim() }
      : {}),
  };
}

export function meetsMinimumContribution(
  amount: string,
  minimum: string,
): boolean {
  const value = contributionCents(amount);
  const floor = contributionCents(minimum);
  return value !== null && floor !== null && value >= floor;
}

/** No invented unlock date: an unsigned or unsaved plan has no recorded start time. */
export function retrievalReminderAt(schedule: SavingsSchedule): string | null {
  if (!schedule.startedAt || schedule.minimumRetrievalDays === 0) return null;
  const start = Date.parse(schedule.startedAt);
  return Number.isFinite(start)
    ? new Date(start + schedule.minimumRetrievalDays * 86_400_000).toISOString()
    : null;
}
