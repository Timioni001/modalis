"use client";

/**
 * Goals, plural.
 *
 * The order on this screen IS the funding order: the first goal is filled to its target before
 * the second receives anything. Moving a goal up is therefore a real decision about money, and
 * the screen shows its consequence immediately — each card re-reads its share after a move.
 *
 * "Where would $X go?" answers from the same waterfall, so the preview and what happens agree.
 */
import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { toast } from "sonner";
import type { GoalCard, GoalsView } from "@modalis/domain";
import {
  Button,
  Card,
  Choices,
  Field,
  MoneyField,
  Notice,
  PageHeader,
  SectionTitle,
  SelectField,
  Skeleton,
  TextField,
} from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { usePortfolio } from "@/components/portfolio-provider";
import { ApiError, apiGet, apiPost } from "@/lib/client-api";
import { moneyLabel, monthYear } from "@/lib/format";
import { inflatedTarget } from "@/lib/afford";

/** A steady yearly inflation assumption for "in today's money". Stated on screen, never hidden. */
const INFLATION = 0.03;

export default function GoalsPage() {
  return (
    <PortfolioGate>
      <Goals />
    </PortfolioGate>
  );
}

const KIND_OPTIONS = [
  { value: "emergency_reserve", label: "A safety net" },
  { value: "house", label: "A home" },
  { value: "education", label: "Education" },
  { value: "major_purchase", label: "A big purchase" },
  { value: "travel", label: "Travel" },
  { value: "retirement", label: "Retirement" },
  { value: "long_term_wealth", label: "Long-term" },
  { value: "custom", label: "Something else" },
] as const;

const DOT: Record<string, string> = {
  on_track: "bg-ok",
  needs_attention: "bg-warn",
  off_track: "bg-breach",
  not_started: "bg-ink-muted",
};

function Goals() {
  const { refresh } = usePortfolio();
  const [view, setView] = useState<GoalsView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [adding, setAdding] = useState(false);

  const load = useCallback(async () => {
    try {
      setView(await apiGet<GoalsView>("/api/goals"));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn't load your goals.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function move(index: number, by: -1 | 1) {
    if (!view) return;
    const ids = view.goals.map((g) => g.id);
    const to = index + by;
    if (to < 0 || to >= ids.length) return;
    [ids[index], ids[to]] = [ids[to], ids[index]];
    setBusy(true);
    try {
      setView(await apiPost<GoalsView>("/api/goals/order", { order: ids }));
      await refresh();
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : "We couldn't change the order.");
    } finally {
      setBusy(false);
    }
  }

  if (error) return <Notice tone="warn">{error}</Notice>;
  if (!view) return <Skeleton className="h-72" />;

  return (
    <div className="space-y-4">
      <PageHeader
        title="Your goals"
        lede="Your money fills them in this order: the first is funded to its target before the next receives anything."
        action={
          view.canManage ? (
            <Button onClick={() => setAdding((v) => !v)} variant={adding ? "secondary" : "primary"}>
              {adding ? "Close" : "Add a goal"}
            </Button>
          ) : undefined
        }
      />

      {!view.canManage ? (
        <Notice tone="default" title="Only your plan's goal can be shown here">
          Extra goals are saved in a database, which isn&rsquo;t set up on this deployment.
        </Notice>
      ) : null}

      <AnimatePresence>{adding ? <AddGoal onDone={async (v) => { setView(v); setAdding(false); await refresh(); }} /> : null}</AnimatePresence>

      <ol className="space-y-3">
        {view.goals.map((g, i) => (
          <motion.li key={g.id} layout transition={{ type: "spring", stiffness: 380, damping: 34 }}>
            <GoalRowCard
              goal={g}
              isPlanGoal={g.id === view.planGoalId}
              first={i === 0}
              last={i === view.goals.length - 1}
              canMove={view.canManage && view.goals.length > 1 && !busy}
              onUp={() => move(i, -1)}
              onDown={() => move(i, 1)}
            />
          </motion.li>
        ))}
      </ol>

      {Number(view.surplus.amount) > 0 ? (
        <Card className="flex items-center justify-between gap-4">
          <div>
            <div className="text-[15px] font-semibold text-ink">Beyond every goal</div>
            <p className="mt-0.5 text-[13.5px] text-ink-muted">Yours, not counted toward any goal.</p>
          </div>
          <div className="numeric text-[20px] font-semibold text-ink">{moneyLabel(view.surplus)}</div>
        </Card>
      ) : null}

      <WhereWouldItGo />
    </div>
  );
}

function GiftLink({ name }: { name: string }) {
  const { address } = usePortfolio();
  const [copied, setCopied] = useState(false);
  if (!address) return null;
  async function copy() {
    const url = `${window.location.origin}/app/gift/${address}?for=${encodeURIComponent(name)}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this gift link:", url);
    }
  }
  return (
    <button type="button" onClick={copy} className="mt-2 text-[13px] font-semibold text-ink underline underline-offset-4">
      {copied ? "Gift link copied" : "Copy a gift link for family and friends"}
    </button>
  );
}

function GoalRowCard({
  goal,
  isPlanGoal,
  first,
  last,
  canMove,
  onUp,
  onDown,
}: {
  goal: GoalCard;
  isPlanGoal: boolean;
  first: boolean;
  last: boolean;
  canMove: boolean;
  onUp: () => void;
  onDown: () => void;
}) {
  const pct = Math.min(100, goal.percentComplete);
  return (
    <div className="flex gap-3 rounded-[24px] bg-surface p-5 shadow-[var(--shadow-card)] sm:gap-4 sm:p-6">
      <div className="flex flex-col items-center gap-1">
        <span className="numeric flex h-9 w-9 items-center justify-center rounded-full bg-panel text-[14px] font-semibold text-panel-ink">
          {goal.priority}
        </span>
        {canMove ? (
          <div className="mt-1 flex flex-col">
            <MoveButton label={`Fund ${goal.name} sooner`} disabled={first} onClick={onUp} up />
            <MoveButton label={`Fund ${goal.name} later`} disabled={last} onClick={onDown} />
          </div>
        ) : null}
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="text-[17px] font-semibold text-ink">{goal.name}</h2>
          {isPlanGoal ? (
            <span className="rounded-full bg-accent-soft px-2.5 py-0.5 text-[11.5px] font-semibold text-ink">Your plan&rsquo;s goal</span>
          ) : null}
          <span className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-muted">
            <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${DOT[goal.health] ?? "bg-ink-muted"}`} />
            {goal.healthLabel}
          </span>
        </div>

        <div className="mt-3 flex items-baseline justify-between gap-3">
          <span className="numeric text-[22px] font-semibold text-ink">{moneyLabel(goal.saved, 0)}</span>
          <span className="numeric text-[13px] text-ink-muted">
            of {moneyLabel(goal.target, 0)} · {monthYear(goal.targetDate)}
          </span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label={`${goal.name}: ${Math.round(pct)}% funded`}>
          <motion.div className="h-full rounded-full bg-ink" initial={false} animate={{ width: `${pct}%` }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        </div>
        <p className="mt-3 text-[14px] leading-relaxed text-ink-soft">{goal.summary}</p>
        <GiftLink name={goal.name} />
        {goal.monthsRemaining >= 12 ? (
          <p className="mt-1.5 text-[13px] text-ink-muted">
            To keep its value at {Math.round(INFLATION * 100)}% yearly inflation, aim for about{" "}
            <span className="numeric">
              ${Math.round(inflatedTarget(Number(goal.target.amount), goal.monthsRemaining, INFLATION)).toLocaleString("en-US")}
            </span>{" "}
            by {monthYear(goal.targetDate)}.
          </p>
        ) : null}
      </div>
    </div>
  );
}

function MoveButton({ label, disabled, onClick, up = false }: { label: string; disabled: boolean; onClick: () => void; up?: boolean }) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-sunken hover:text-ink disabled:opacity-25 disabled:hover:bg-transparent"
    >
      <svg aria-hidden viewBox="0 0 16 16" className={`h-4 w-4 ${up ? "" : "rotate-180"}`} fill="none">
        <path d="M4 10l4-4 4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

function AddGoal({ onDone }: { onDone: (v: GoalsView) => void }) {
  const [kind, setKind] = useState<string>("emergency_reserve");
  const [name, setName] = useState("A safety net");
  const [target, setTarget] = useState(5_000);
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [monthly, setMonthly] = useState(150);
  const [liquidity, setLiquidity] = useState<"none" | "some" | "significant">("some");
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setProblem(null);
    try {
      const v = await apiPost<GoalsView>("/api/goals", {
        kind,
        name,
        targetValue: String(target),
        targetDate: date,
        contributionAmount: String(monthly),
        contributionCadence: "monthly",
        liquidityNeed: liquidity,
      });
      toast.success(`${name} added. It's funded after your other goals until you move it up.`);
      onDone(v);
    } catch (err) {
      setProblem(err instanceof ApiError ? err.message : "We couldn't add that goal.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }} transition={{ duration: 0.2 }}>
      <Card>
        <SectionTitle>A new goal</SectionTitle>
        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="What is it for?" htmlFor="kind">
            <SelectField
              id="kind"
              value={kind}
              onChange={(e) => {
                setKind(e.target.value);
                const label = KIND_OPTIONS.find((k) => k.value === e.target.value)?.label;
                if (label && label !== "Something else") setName(label);
              }}
            >
              {KIND_OPTIONS.map((k) => (
                <option key={k.value} value={k.value}>{k.label}</option>
              ))}
            </SelectField>
          </Field>
          <Field label="Call it" htmlFor="name">
            <TextField id="name" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="How much?" htmlFor="target">
            <MoneyField id="target" value={target} min={100} max={100_000_000} onChange={setTarget} />
          </Field>
          <Field label="By when?" htmlFor="date">
            <TextField id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="What you'll add each month" htmlFor="monthly">
            <MoneyField id="monthly" value={monthly} max={1_000_000} onChange={setMonthly} />
          </Field>
          <Field label="How reachable must it stay?" htmlFor="liq">
            <Choices
              name="liq"
              value={liquidity}
              onChange={setLiquidity}
              options={[
                { value: "none", label: "Not urgent" },
                { value: "some", label: "Some" },
                { value: "significant", label: "Very" },
              ]}
            />
          </Field>
        </div>
        {problem ? <div className="mt-4"><Notice tone="warn">{problem}</Notice></div> : null}
        <div className="mt-6 flex gap-3">
          <Button onClick={save} busy={saving} busyLabel="Saving…" disabled={!name.trim() || target <= 0}>
            Add this goal
          </Button>
        </div>
      </Card>
    </motion.div>
  );
}

function WhereWouldItGo() {
  const [amount, setAmount] = useState(500);
  const [lines, setLines] = useState<{ sentence: string }[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (amount <= 0) return setLines(null);
    let alive = true;
    setLoading(true);
    const t = setTimeout(() => {
      apiPost<{ destinations: { sentence: string }[] }>("/api/goals/preview", { amount: String(amount) })
        .then((d) => alive && setLines(d.destinations))
        .catch(() => alive && setLines(null))
        .finally(() => alive && setLoading(false));
    }, 300);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [amount]);

  return (
    <Card>
      <SectionTitle hint="Nothing is added — this only shows where it would go.">If you added</SectionTitle>
      <div className="max-w-xs">
        <MoneyField id="preview" value={amount} max={100_000_000} onChange={setAmount} />
      </div>
      <ul className="mt-4 space-y-2" aria-live="polite">
        {loading && !lines ? <li className="text-[14px] text-ink-muted">Working it out…</li> : null}
        {lines?.map((l) => (
          <li key={l.sentence} className="flex items-center gap-2.5 text-[15px] text-ink">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent-ink" />
            {l.sentence}
          </li>
        ))}
      </ul>
    </Card>
  );
}
