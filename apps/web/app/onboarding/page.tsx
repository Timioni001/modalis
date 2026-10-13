"use client";

/**
 * The goal questions.
 *
 * Five steps, one question-group each, nothing financial in the wording. The step that matters is
 * the behavioural one — "your money falls 12%, what do you do" — because "sell everything" and
 * "add more while it's cheap" describe very different people even when both say they'd accept a
 * 15% drop.
 *
 * Nothing is written anywhere until the plan is approved on the next screen.
 */
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import type { GoalAnswers } from "@modalis/domain";
import { savingsPreferenceProblem } from "@modalis/domain/client";
import { SavingsPreferencesFields } from "@/components/savings-preferences";
import {
  Button,
  Card,
  Choices,
  Field,
  MoneyField,
  Notice,
  SelectField,
  Slider,
  TextField,
} from "@/components/ui";
import { DEFAULT_ANSWERS, saveAnswers } from "@/lib/goal-answers";
import { GOAL_TEMPLATES } from "@/lib/goal-templates";
import { monthsToHuman } from "@/lib/format";

const STEPS = [
  { id: "goal", title: "What are you saving for?" },
  { id: "amount", title: "How much, and by when?" },
  { id: "funding", title: "How much can you put in?" },
  { id: "behaviour", title: "One question about falls" },
  { id: "limits", title: "Your limits" },
] as const;

const GOALS: { value: GoalAnswers["goalKind"]; label: string; hint: string }[] =
  [
    { value: "house", label: "A home", hint: "A deposit or a purchase" },
    {
      value: "emergency_reserve",
      label: "A safety net",
      hint: "Money that must stay reachable",
    },
    { value: "education", label: "Education", hint: "Tuition or study costs" },
    {
      value: "major_purchase",
      label: "A big expense",
      hint: "A wedding, a move, a car",
    },
    {
      value: "long_term_wealth",
      label: "Long-term",
      hint: "No fixed purpose yet",
    },
    { value: "retirement", label: "Retirement", hint: "A long horizon" },
    { value: "custom", label: "Something else", hint: "Describe it yourself" },
  ];

const FALL_RESPONSES: {
  value: GoalAnswers["ifItFellResponse"];
  label: string;
}[] = [
  { value: "sell_everything", label: "Sell everything" },
  { value: "sell_some", label: "Sell some of it" },
  { value: "do_nothing", label: "Do nothing and wait" },
  { value: "invest_more", label: "Add more while it's cheaper" },
];

export default function OnboardingPage() {
  return (
    <Suspense fallback={<div className="mx-auto h-96 max-w-xl px-5 py-14" />}>
      <Onboarding />
    </Suspense>
  );
}

/** Anything the person already told us in the hero, bounded — it arrived in a URL. */
function answersFromQuery(params: URLSearchParams): Partial<GoalAnswers> {
  const num = (key: string, min: number, max: number): number | undefined => {
    const raw = params.get(key);
    if (raw === null) return undefined;
    const value = Number(raw);
    if (!Number.isFinite(value)) return undefined;
    return Math.min(max, Math.max(min, Math.round(value)));
  };
  const kind = params.get("goal");
  const valid = GOALS.some((g) => g.value === kind);

  return {
    ...(valid ? { goalKind: kind as GoalAnswers["goalKind"] } : {}),
    ...(num("amount", 500, 5_000_000) !== undefined
      ? { targetAmount: num("amount", 500, 5_000_000)! }
      : {}),
    ...(num("months", 6, 360) !== undefined
      ? { monthsUntilNeeded: num("months", 6, 360)! }
      : {}),
    ...(num("monthly", 0, 100_000) !== undefined
      ? { contributionAmount: num("monthly", 0, 100_000)! }
      : {}),
  };
}

function Onboarding() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState(1);
  const [answers, setAnswers] = useState<GoalAnswers>(() => ({
    ...DEFAULT_ANSWERS,
    ...answersFromQuery(new URLSearchParams(searchParams?.toString() ?? "")),
  }));
  const [description, setDescription] = useState("");

  const set = <K extends keyof GoalAnswers>(key: K, value: GoalAnswers[K]) =>
    setAnswers((a) => ({ ...a, [key]: value }));

  const problems = useMemo(() => validate(answers, step), [answers, step]);
  const last = step === STEPS.length - 1;

  function go(next: number) {
    setDirection(next > step ? 1 : -1);
    setStep(next);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function next() {
    if (problems.length > 0) return;
    if (!last) return go(step + 1);
    saveAnswers({ ...answers, inTheirWords: description.trim() || undefined });
    router.push("/plan");
  }

  return (
    <div className="mx-auto max-w-xl overflow-x-clip px-4 py-8 sm:py-14">
      {/* A second card tilted behind the first: the stack reads as "more questions to come". */}
      <div className="relative">
        <div
          aria-hidden
          className="absolute inset-0 translate-x-2 translate-y-3 rotate-[3deg] rounded-[32px] bg-surface/70 shadow-[var(--shadow-card)]"
        />
        <div className="relative rounded-[32px] bg-surface p-6 shadow-[var(--shadow-lift)] sm:p-9">
          <div className="flex items-center gap-4">
            <div className="flex flex-1 gap-1.5" role="presentation">
              {STEPS.map((s, i) => (
                <span
                  key={s.id}
                  className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
                    i < step ? "bg-ink" : i === step ? "bg-ink/70" : "bg-line"
                  }`}
                />
              ))}
            </div>
            <a
              href="/"
              aria-label="Leave — nothing is saved"
              className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-ink-muted/80 text-surface transition-colors hover:bg-ink"
            >
              <svg
                aria-hidden
                viewBox="0 0 16 16"
                className="h-3.5 w-3.5"
                fill="none"
              >
                <path
                  d="M4 4l8 8M12 4l-8 8"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                />
              </svg>
            </a>
          </div>

          {/* --------------------------------------------------------- the question */}
          <AnimatePresence mode="wait" initial={false} custom={direction}>
            <motion.div
              key={step}
              custom={direction}
              initial={{ opacity: 0, x: direction * 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: direction * -16 }}
              transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            >
              <div className="eyebrow mt-9 text-ink-soft">
                Question {String(step + 1).padStart(2, "0")}
              </div>
              <h1 className="display mt-3 text-[30px] font-semibold text-ink sm:text-[36px]">
                {STEPS[step].title}
              </h1>

              <div className="mt-7 space-y-6">
                {STEPS[step].id === "goal" ? (
                  <>
                    <div>
                      <div className="text-sm font-medium text-ink-soft">
                        Start from a common goal
                      </div>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {GOAL_TEMPLATES.map((t) => (
                          <button
                            key={t.id}
                            type="button"
                            title={t.hint}
                            onClick={() => {
                              setAnswers((a) => ({ ...a, ...t.answers }));
                              setDescription(t.words);
                            }}
                            className="min-h-[40px] rounded-full bg-sunken px-4 text-[13.5px] font-semibold text-ink-soft transition-colors hover:bg-line hover:text-ink"
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                      <p className="mt-2 text-xs text-ink-muted">
                        Fills in sensible answers; you can change every one.
                      </p>
                    </div>
                    <Choices
                      name="goal"
                      value={answers.goalKind}
                      onChange={(v) => set("goalKind", v)}
                      options={GOALS}
                      columns={2}
                    />
                    <Field
                      label="In your own words"
                      hint="Optional. Modalis will read this and confirm what it understood."
                      htmlFor="own-words"
                    >
                      <TextField
                        id="own-words"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="A deposit for a flat, in about five years"
                        maxLength={300}
                      />
                    </Field>
                  </>
                ) : null}

                {STEPS[step].id === "amount" ? (
                  <>
                    <Field label="How much do you need?" htmlFor="target">
                      <MoneyField
                        id="target"
                        value={answers.targetAmount}
                        min={500}
                        max={5_000_000}
                        onChange={(v) => set("targetAmount", v)}
                      />
                    </Field>
                    <Field label="When do you need it?" htmlFor="months">
                      <Slider
                        id="months"
                        value={answers.monthsUntilNeeded}
                        min={6}
                        max={360}
                        step={6}
                        onChange={(v) => set("monthsUntilNeeded", v)}
                        format={monthsToHuman}
                        minLabel="6 months"
                        maxLabel="30 years"
                      />
                    </Field>
                  </>
                ) : null}

                {STEPS[step].id === "funding" ? (
                  <>
                    <Field
                      label="How much do you have to start?"
                      htmlFor="starting"
                    >
                      <MoneyField
                        id="starting"
                        value={answers.startingAmount}
                        max={5_000_000}
                        onChange={(v) => set("startingAmount", v)}
                      />
                    </Field>
                    <Field
                      label="How much can you add regularly?"
                      htmlFor="contribution"
                    >
                      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-[minmax(0,1fr)_150px]">
                        <div className="min-w-0">
                          <MoneyField
                            id="contribution"
                            value={answers.contributionAmount}
                            max={100_000}
                            onChange={(v) => set("contributionAmount", v)}
                          />
                        </div>
                        <SelectField
                          aria-label="How often you add"
                          value={answers.contributionCadence}
                          onChange={(e) =>
                            set(
                              "contributionCadence",
                              e.target
                                .value as GoalAnswers["contributionCadence"],
                            )
                          }
                          className="min-w-0"
                        >
                          <option value="weekly">per week</option>
                          <option value="monthly">per month</option>
                          <option value="quarterly">per quarter</option>
                        </SelectField>
                      </div>
                    </Field>
                    <Field label="How steady is your income?" htmlFor="income">
                      <Choices
                        name="income"
                        value={answers.incomeSteadiness}
                        onChange={(v) => set("incomeSteadiness", v)}
                        options={[
                          { value: "unstable", label: "It varies" },
                          { value: "stable", label: "Fairly steady" },
                          { value: "very_stable", label: "Very steady" },
                        ]}
                      />
                    </Field>
                  </>
                ) : null}

                {STEPS[step].id === "behaviour" ? (
                  <>
                    <Card className="bg-sunken shadow-none">
                      <p className="text-[17px] leading-relaxed text-ink">
                        Your money falls{" "}
                        <span className="numeric font-semibold">12%</span> over
                        a few months. What would you actually do?
                      </p>
                      <p className="mt-2 text-sm text-ink-muted">
                        There&rsquo;s no right answer. This is the question that
                        tells Modalis how much movement your plan should carry.
                      </p>
                    </Card>
                    <Choices
                      name="fall"
                      value={answers.ifItFellResponse}
                      onChange={(v) => set("ifItFellResponse", v)}
                      options={FALL_RESPONSES}
                      columns={1}
                    />
                  </>
                ) : null}

                {STEPS[step].id === "limits" ? (
                  <>
                    <Field
                      label="The most you'd be willing to lose"
                      hint="Modalis keeps your plan inside this. Below it, the plan gets more cautious."
                      htmlFor="drawdown"
                    >
                      <Slider
                        id="drawdown"
                        value={answers.comfortableLosingPercent}
                        min={2}
                        max={40}
                        onChange={(v) => set("comfortableLosingPercent", v)}
                        format={(v) => `${v}%`}
                        minLabel="2%"
                        maxLabel="40%"
                      />
                      <p className="mt-3 text-sm text-ink-soft">
                        On {`$${answers.targetAmount.toLocaleString("en-US")}`},
                        that&rsquo;s about{" "}
                        <span className="numeric font-semibold text-ink">
                          $
                          {Math.round(
                            (answers.targetAmount *
                              answers.comfortableLosingPercent) /
                              100,
                          ).toLocaleString("en-US")}
                        </span>{" "}
                        in a bad year.
                      </p>
                    </Field>
                    <Field
                      label="How much needs to stay reachable?"
                      htmlFor="liquidity"
                    >
                      <Choices
                        name="liquidity"
                        value={answers.moneyKeptAvailable}
                        onChange={(v) => set("moneyKeptAvailable", v)}
                        options={[
                          { value: "none", label: "Very little" },
                          { value: "some", label: "Some of it" },
                          { value: "significant", label: "A large share" },
                        ]}
                      />
                    </Field>
                    <SavingsPreferencesFields
                      value={answers.savings}
                      onChange={(value) => set("savings", value)}
                    />
                  </>
                ) : null}
              </div>
            </motion.div>
          </AnimatePresence>

          {problems.length > 0 ? (
            <div className="mt-6">
              <Notice tone="warn">{problems[0]}</Notice>
            </div>
          ) : null}

          {/* ------------------------------------------------------------- actions */}
          <div className="mt-10 flex items-center justify-end gap-3">
            {step > 0 ? (
              <button
                type="button"
                onClick={() => go(step - 1)}
                className="min-h-[52px] rounded-2xl px-6 text-[16px] font-semibold text-ink hover:bg-sunken"
              >
                Back
              </button>
            ) : null}
            <button
              type="button"
              onClick={next}
              disabled={problems.length > 0}
              className="min-h-[56px] min-w-[150px] rounded-2xl bg-accent px-8 text-[16px] font-semibold text-accent-ink shadow-[0_0_0_1.5px_var(--color-accent-line)] transition-[filter,transform] hover:brightness-[1.04] active:scale-[0.985] disabled:opacity-50"
            >
              {last ? "See my plan" : "Next"}
            </button>
          </div>
        </div>
      </div>
      <p className="mt-6 text-center text-[13px] text-ink-muted">
        Nothing is saved until you approve your plan.
      </p>
    </div>
  );
}

/** Client-side checks that mirror the planner's own preconditions, so errors land here. */
function validate(a: GoalAnswers, step: number): string[] {
  const id = STEPS[step].id;
  const out: string[] = [];
  if (id === "limits" && a.savings) {
    const problem = savingsPreferenceProblem(a.savings);
    if (problem) out.push(problem);
    else if (
      a.contributionAmount > 0 &&
      a.contributionAmount < Number(a.savings.minimumContribution)
    )
      out.push(
        "Your regular contribution must meet your chosen minimum. Go back to change the amount, or lower the minimum.",
      );
  }
  if (id === "amount") {
    if (!(a.targetAmount > 0)) out.push("Enter the amount you need.");
    if (a.monthsUntilNeeded < 1) out.push("Choose when you need the money.");
  }
  if (id === "funding") {
    if (a.startingAmount === 0 && a.contributionAmount === 0) {
      out.push(
        "Add a starting amount or a regular contribution — a plan needs money in it.",
      );
    }
  }
  return out;
}
