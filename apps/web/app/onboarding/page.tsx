"use client";

/**
 * The goal interview.
 *
 * Questions are human, not financial: what the money is for, how much, by when, and what the
 * person would actually do in a downturn. The behavioural question is the one that produces
 * useful information — "sell everything" and "invest more" describe very different investors
 * even when both say they tolerate a 15% fall.
 *
 * Nothing here is written on-chain. The answers become a mandate on the next screen, and only
 * the user's own signature puts it on Monad.
 */
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import type { InterviewAnswers } from "@modalis/ai";
import { Badge, Button, Card, Notice } from "@/components/ui";
import { monthsToHuman } from "@/lib/format";
import { DEFAULT_ANSWERS, saveAnswers } from "@/lib/interview-store";

type Step = { id: string; title: string; hint?: string };

const STEPS: Step[] = [
  { id: "goal", title: "What are you investing for?" },
  { id: "amount", title: "How much do you need, and by when?" },
  { id: "funding", title: "How much can you put in?" },
  {
    id: "behaviour",
    title: "A quick question about market falls",
    hint: "There is no right answer. This tells Modalis how much volatility your plan should carry.",
  },
  { id: "constraints", title: "Your limits" },
];

const GOALS: { value: InterviewAnswers["goalType"]; label: string; blurb: string }[] = [
  { value: "house", label: "A home", blurb: "A deposit or a purchase" },
  { value: "education", label: "Education", blurb: "Tuition or study costs" },
  { value: "long_term_wealth", label: "Long-term wealth", blurb: "No fixed purpose yet" },
  { value: "emergency_reserve", label: "Emergency reserve", blurb: "Money that must stay reachable" },
  { value: "retirement", label: "Retirement", blurb: "A long horizon" },
  { value: "custom", label: "Something else", blurb: "Describe it yourself" },
];

const DRAWDOWN: { value: InterviewAnswers["drawdownResponse"]; label: string }[] = [
  { value: "sell_everything", label: "Sell everything" },
  { value: "sell_some", label: "Sell some of it" },
  { value: "do_nothing", label: "Do nothing and wait" },
  { value: "invest_more", label: "Invest more while prices are lower" },
];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [answers, setAnswers] = useState<InterviewAnswers>(DEFAULT_ANSWERS);
  const [description, setDescription] = useState("");

  const set = <K extends keyof InterviewAnswers>(key: K, value: InterviewAnswers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const problems = useMemo(() => validate(answers, step), [answers, step]);
  const last = step === STEPS.length - 1;

  function next() {
    if (problems.length > 0) return;
    if (!last) {
      setStep((s) => s + 1);
      return;
    }
    saveAnswers({ ...answers, goalDescription: description.trim() || undefined });
    router.push("/mandate");
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-14">
      <div className="flex items-center justify-between">
        <Badge tone="accent">
          Step {step + 1} of {STEPS.length}
        </Badge>
        <span className="text-sm text-ink-muted">Nothing is committed yet</span>
      </div>

      <div className="mt-5 h-1 w-full overflow-hidden rounded-full bg-surface-sunken">
        <div
          className="h-full rounded-full bg-accent transition-[width] duration-300"
          style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
        />
      </div>

      <h1 className="mt-8 text-3xl font-semibold tracking-tight text-ink">{STEPS[step].title}</h1>
      {STEPS[step].hint ? <p className="mt-3 text-ink-soft">{STEPS[step].hint}</p> : null}

      <div className="mt-8 space-y-6">
        {STEPS[step].id === "goal" ? (
          <>
            <fieldset className="grid gap-3 sm:grid-cols-2">
              <legend className="sr-only">Goal type</legend>
              {GOALS.map((g) => (
                <label
                  key={g.value}
                  className={`cursor-pointer rounded-xl border p-4 transition-colors ${
                    answers.goalType === g.value
                      ? "border-accent bg-accent-soft"
                      : "border-line hover:bg-surface-sunken"
                  }`}
                >
                  <input
                    type="radio"
                    name="goalType"
                    className="sr-only"
                    checked={answers.goalType === g.value}
                    onChange={() => set("goalType", g.value)}
                  />
                  <span className="block font-semibold text-ink">{g.label}</span>
                  <span className="mt-0.5 block text-sm text-ink-muted">{g.blurb}</span>
                </label>
              ))}
            </fieldset>

            <Field
              label="In your own words (optional)"
              hint="Modalis will read this and confirm what it understood."
            >
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={3}
                placeholder="I want $20,000 for a house deposit in about five years."
                className="w-full rounded-xl border border-line p-3 text-ink outline-none focus:border-accent"
              />
            </Field>
          </>
        ) : null}

        {STEPS[step].id === "amount" ? (
          <>
            <Field label="How much do you need?">
              <MoneyInput value={answers.targetValue} onChange={(v) => set("targetValue", v)} />
            </Field>
            <Field label="When do you need it?" hint={monthsToHuman(answers.horizonMonths)}>
              <input
                type="range"
                min={6}
                max={360}
                step={6}
                value={answers.horizonMonths}
                onChange={(e) => set("horizonMonths", Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="mt-1 flex justify-between text-xs text-ink-muted">
                <span>6 months</span>
                <span>30 years</span>
              </div>
            </Field>
          </>
        ) : null}

        {STEPS[step].id === "funding" ? (
          <>
            <Field label="How much do you have to start?">
              <MoneyInput value={answers.initialAmount} onChange={(v) => set("initialAmount", v)} />
            </Field>
            <Field label="How much can you add regularly?">
              <div className="flex gap-3">
                <MoneyInput
                  value={answers.contributionAmount}
                  onChange={(v) => set("contributionAmount", v)}
                />
                <select
                  value={answers.contributionCadence}
                  onChange={(e) =>
                    set("contributionCadence", e.target.value as InterviewAnswers["contributionCadence"])
                  }
                  className="rounded-xl border border-line px-3 text-ink outline-none focus:border-accent"
                >
                  <option value="weekly">per week</option>
                  <option value="monthly">per month</option>
                  <option value="quarterly">per quarter</option>
                </select>
              </div>
            </Field>
            <Field label="How steady is your income?">
              <Choices
                value={answers.incomeStability}
                onChange={(v) => set("incomeStability", v)}
                options={[
                  { value: "unstable", label: "It varies a lot" },
                  { value: "stable", label: "Fairly steady" },
                  { value: "very_stable", label: "Very steady" },
                ]}
              />
            </Field>
          </>
        ) : null}

        {STEPS[step].id === "behaviour" ? (
          <>
            <Card className="bg-surface-sunken">
              <p className="text-ink">
                Your portfolio falls <span className="numeric font-semibold">12%</span> during a market
                downturn. What would you most likely do?
              </p>
            </Card>
            <Choices
              value={answers.drawdownResponse}
              onChange={(v) => set("drawdownResponse", v)}
              options={DRAWDOWN}
              stacked
            />
          </>
        ) : null}

        {STEPS[step].id === "constraints" ? (
          <>
            <Field
              label="What is the largest fall you would accept?"
              hint={`Modalis will hold your portfolio to no more than ${answers.maxTolerableDrawdownPct}% — or tighter, if your plan calls for it.`}
            >
              <input
                type="range"
                min={2}
                max={40}
                step={1}
                value={answers.maxTolerableDrawdownPct}
                onChange={(e) => set("maxTolerableDrawdownPct", Number(e.target.value))}
                className="w-full accent-accent"
              />
              <div className="numeric mt-1 text-2xl font-semibold text-ink">
                {answers.maxTolerableDrawdownPct}%
              </div>
            </Field>
            <Field
              label="How much needs to stay reachable?"
              hint="Held in cash-like assets you can withdraw at any time."
            >
              <Choices
                value={answers.liquidityNeed}
                onChange={(v) => set("liquidityNeed", v)}
                options={[
                  { value: "none", label: "Very little" },
                  { value: "some", label: "Some of it" },
                  { value: "significant", label: "A large share" },
                ]}
              />
            </Field>
          </>
        ) : null}
      </div>

      {problems.length > 0 ? (
        <div className="mt-6">
          <Notice tone="warn">{problems[0]}</Notice>
        </div>
      ) : null}

      <div className="mt-10 flex items-center justify-between">
        <Button variant="quiet" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
          Back
        </Button>
        <Button onClick={next} disabled={problems.length > 0}>
          {last ? "See my mandate" : "Continue"}
        </Button>
      </div>
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-semibold text-ink">{label}</span>
      {hint ? <span className="mt-1 block text-sm text-ink-muted">{hint}</span> : null}
      <div className="mt-3">{children}</div>
    </label>
  );
}

function MoneyInput({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div className="flex items-center rounded-xl border border-line focus-within:border-accent">
      <span className="pl-4 text-ink-muted">$</span>
      <input
        type="number"
        min={0}
        step={50}
        value={Number.isFinite(value) ? value : 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="numeric w-full bg-transparent px-2 py-3 text-lg font-semibold text-ink outline-none"
      />
    </div>
  );
}

function Choices<T extends string>({
  value,
  onChange,
  options,
  stacked = false,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  stacked?: boolean;
}) {
  return (
    <div className={stacked ? "grid gap-3" : "grid gap-3 sm:grid-cols-3"}>
      {options.map((o) => (
        <label
          key={o.value}
          className={`cursor-pointer rounded-xl border p-4 text-sm font-medium transition-colors ${
            value === o.value
              ? "border-accent bg-accent-soft text-accent"
              : "border-line text-ink hover:bg-surface-sunken"
          }`}
        >
          <input type="radio" className="sr-only" checked={value === o.value} onChange={() => onChange(o.value)} />
          {o.label}
        </label>
      ))}
    </div>
  );
}

/** Client-side checks that match the pipeline's own preconditions, so errors land here. */
function validate(a: InterviewAnswers, step: number): string[] {
  const id = STEPS[step].id;
  const out: string[] = [];
  if (id === "amount") {
    if (!(a.targetValue > 0)) out.push("Enter the amount you need.");
    if (a.horizonMonths < 1) out.push("Choose when you need the money.");
  }
  if (id === "funding") {
    if (a.initialAmount < 0 || a.contributionAmount < 0) out.push("Amounts cannot be negative.");
    if (a.initialAmount === 0 && a.contributionAmount === 0) {
      out.push("Add a starting amount or a regular contribution — a portfolio needs funding.");
    }
  }
  return out;
}
