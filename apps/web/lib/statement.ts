/**
 * Statements from the activity feed: a CSV of every transaction, and a plain-English summary of
 * the last seven days. Both read only what the feed already shows, so they can't disagree with it.
 */
import type { ActivityItem } from "@modalis/domain";

const cell = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

export function activityCsv(items: ActivityItem[]): string {
  const rows = [["Date", "What happened", "Amount (USD)", "Detail", "Receipt", "Explorer link"]];
  for (const i of items) {
    rows.push([
      i.at,
      i.title,
      i.amount?.amount ?? "",
      i.detail ?? "",
      i.receipt?.reference ?? "",
      i.receipt?.url ?? "",
    ]);
  }
  return rows.map((r) => r.map(cell).join(",")).join("\n") + "\n";
}

export type WeekSummary = {
  added: number;
  withdrawn: number;
  adjustments: number;
  blocked: number;
  /** One or two sentences, ready to show. */
  sentence: string;
};

const usd = (n: number) => `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function weekSummary(items: ActivityItem[], now = new Date()): WeekSummary {
  const since = now.getTime() - 7 * 24 * 60 * 60 * 1000;
  const week = items.filter((i) => {
    const t = new Date(i.at).getTime();
    return !Number.isNaN(t) && t >= since && t <= now.getTime();
  });
  const sum = (kind: ActivityItem["kind"]) =>
    week.filter((i) => i.kind === kind).reduce((s, i) => s + Number(i.amount?.amount ?? 0), 0);
  const count = (kind: ActivityItem["kind"]) => week.filter((i) => i.kind === kind).length;

  const added = sum("money_added");
  const withdrawn = sum("money_withdrawn");
  const adjustments = count("adjustment_made");
  const blocked = count("adjustment_blocked");

  const parts: string[] = [];
  if (added > 0) parts.push(`you added ${usd(added)}`);
  if (withdrawn > 0) parts.push(`you took out ${usd(withdrawn)}`);
  if (adjustments > 0) parts.push(`Modalis made ${adjustments} adjustment${adjustments === 1 ? "" : "s"} within your limits`);
  let sentence = parts.length
    ? `In the last 7 days ${parts.join(", ")}.`
    : "Nothing moved in the last 7 days.";
  sentence += blocked
    ? ` Your limits stopped ${blocked} trade${blocked === 1 ? "" : "s"} that would have broken them.`
    : " Nothing needed your attention.";
  sentence = sentence.charAt(0).toUpperCase() + sentence.slice(1);
  return { added, withdrawn, adjustments, blocked, sentence };
}
