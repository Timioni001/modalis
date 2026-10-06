"use client";

/**
 * The hero.
 *
 * Don't describe the product — run it. The headline states the promise, and directly under it the
 * person fills in their own goal and watches the answer change. No sign-up, no wallet.
 *
 * Two things keep it honest. It uses the REAL engine — `project()` is the same function the
 * signed-in product uses, so there is no second implementation to drift. And it assumes zero
 * growth, so the only figure it shows is money the person adds themselves.
 *
 * Layout: a white page, one black answer panel. The eye lands on the panel because it is the only
 * dark thing on the screen, and the panel is where the number lives.
 */
import Link from "next/link";
import { useMemo, useState } from "react";
import { motion } from "motion/react";
import { moneyInSentence, project } from "@modalis/domain";
import { moneyCompact } from "@/lib/format";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(Math.max(0, Math.round(n))) * E18;
const money = (e18: bigint) => moneyCompact({ amount: (e18 / E18).toString(), currency: "USD" });
/** Whole dollars, grouped. Cents inside a sentence read as a machine talking. */
const round = (e18: bigint) => moneyInSentence({ amount: (e18 / E18).toString(), currency: "USD" });

type GoalPreset = { id: string; label: string; amount: number; years: number; monthly: number };

const GOALS: GoalPreset[] = [
  { id: "house", label: "a home", amount: 40_000, years: 5, monthly: 600 },
  { id: "emergency_reserve", label: "a safety net", amount: 10_000, years: 2, monthly: 400 },
  { id: "education", label: "education", amount: 25_000, years: 4, monthly: 500 },
  { id: "long_term_wealth", label: "the long term", amount: 100_000, years: 10, monthly: 800 },
];

export function Hero() {
  const [goal, setGoal] = useState<GoalPreset>(GOALS[0]);
  const [amount, setAmount] = useState<number>(GOALS[0].amount);
  const [years, setYears] = useState<number>(GOALS[0].years);
  const [monthly, setMonthly] = useState<number>(GOALS[0].monthly);

  const months = years * 12;

  const projection = useMemo(
    () =>
      project({
        savedE18: 0n,
        targetE18: usd(amount),
        monthlyE18: usd(monthly),
        monthsRemaining: months,
      }),
    [amount, monthly, months],
  );

  const short = projection.shortfallE18 > 0n;
  // How far the person's own contributions get them. NOT `percentComplete`, which measures money
  // already saved — nothing is saved here, so that figure is always zero on this card.
  const target = projection.targetE18;
  const covered =
    target === 0n
      ? 0
      : Math.min(100, Number((projection.projectedE18 * 1000n) / target) / 10);

  function choose(option: GoalPreset) {
    setGoal(option);
    setAmount(option.amount);
    setYears(option.years);
    setMonthly(option.monthly);
  }

  const handoff = new URLSearchParams({
    goal: goal.id,
    amount: String(amount),
    months: String(months),
    monthly: String(monthly),
  }).toString();

  return (
    <section className="relative overflow-hidden">
      {/* A single soft wash behind the headline. Nothing else decorative on this screen. */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[520px]"
        style={{
          background:
            "radial-gradient(70% 100% at 50% 0%, var(--color-accent-soft) 0%, transparent 70%)",
        }}
      />

      <div className="relative mx-auto max-w-6xl px-5 pb-16 pt-14 sm:pt-20">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="max-w-4xl"
        >
          <span className="inline-flex items-center gap-2 rounded-full bg-surface px-3.5 py-1.5 text-[12.5px] font-semibold text-ink-soft shadow-[var(--shadow-card)]">
            <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
            Running on Monad testnet
          </span>

          <h1 className="display mt-6 text-[2.9rem] font-semibold text-ink sm:text-[4.5rem] lg:text-[5.25rem]">
            Turn your goal into a{" "}
            <span className="text-ink-muted">plan that runs itself.</span>
          </h1>
          <p className="mt-6 max-w-lg text-[17px] leading-relaxed text-ink-soft sm:text-lg">
            You set the limits. Modalis builds the plan, keeps your money inside them, and asks
            before it changes anything.
          </p>
        </motion.div>

        {/* ------------------------------------------------- try it, right here */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="mt-12 grid gap-4 lg:grid-cols-[1fr_380px] lg:gap-5"
        >
          {/* the inputs */}
          <div className="rounded-[28px] bg-surface p-5 shadow-[var(--shadow-card)] sm:p-7">
            <div className="flex flex-wrap gap-2" role="group" aria-label="What you're saving for">
              {GOALS.map((option) => {
                const on = option.id === goal.id;
                return (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => choose(option)}
                    aria-pressed={on}
                    className={`inline-flex min-h-[40px] items-center rounded-full px-4 text-[13.5px] font-semibold transition-colors ${
                      on
                        ? "bg-panel text-panel-ink"
                        : "bg-sunken text-ink-soft hover:bg-line hover:text-ink"
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>

            <div className="mt-7 space-y-7">
              <Dial
                id="hero-amount"
                label="I want"
                value={amount}
                display={`$${amount.toLocaleString("en-US")}`}
                min={1_000}
                max={250_000}
                step={1_000}
                onChange={setAmount}
                lo="$1k"
                hi="$250k"
              />
              <Dial
                id="hero-years"
                label="in"
                value={years}
                display={`${years} year${years === 1 ? "" : "s"}`}
                min={1}
                max={30}
                step={1}
                onChange={setYears}
                lo="1 yr"
                hi="30 yrs"
              />
              <Dial
                id="hero-monthly"
                label="putting in"
                value={monthly}
                display={`$${monthly.toLocaleString("en-US")} a month`}
                min={0}
                max={5_000}
                step={50}
                onChange={setMonthly}
                lo="$0"
                hi="$5k"
              />
            </div>
          </div>

          {/* the answer */}
          <div className="flex flex-col gap-4 rounded-[28px] bg-panel p-6 text-panel-ink shadow-[var(--shadow-lift)] sm:p-7">
            <div>
              <div className="text-[13px] font-medium text-panel-soft">
                What you&rsquo;d have put in
              </div>
              <motion.div
                key={projection.projectedE18.toString()}
                initial={{ opacity: 0.4 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.25 }}
                className="numeric mt-2 text-[44px] font-semibold leading-none sm:text-[52px]"
              >
                {money(projection.projectedE18)}
              </motion.div>
              <p className="mt-3 text-sm leading-relaxed text-panel-soft">
                Your own money over {years === 1 ? "a year" : `${years} years`}. Growth is counted
                as zero, so this is the floor, not a forecast.
              </p>
            </div>

            <div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-panel-line">
                <motion.div
                  className="h-full rounded-full bg-accent"
                  animate={{ width: `${covered}%` }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <div className="mt-2.5 flex items-baseline justify-between text-[13px]">
                <span className="numeric font-semibold">{Math.round(covered)}% of your goal</span>
                <span className="numeric text-panel-soft">
                  of ${amount.toLocaleString("en-US")}
                </span>
              </div>
            </div>

            <div className="rounded-2xl bg-panel-line/60 p-4 text-[14px] leading-relaxed">
              {short ? (
                <>
                  <span className="text-panel-soft">To get there on your own, add </span>
                  <span className="numeric font-semibold">
                    {round(projection.requiredMonthlyE18)}
                  </span>
                  <span className="text-panel-soft"> a month — </span>
                  <span className="numeric font-semibold">
                    {round(projection.extraMonthlyE18)}
                  </span>
                  <span className="text-panel-soft"> more than now.</span>
                </>
              ) : (
                <>
                  <span className="font-semibold text-accent">You get there.</span>
                  <span className="text-panel-soft">
                    {" "}
                    On contributions alone, before anything your plan earns.
                  </span>
                </>
              )}
            </div>

            <Link
              href={`/onboarding?${handoff}`}
              className="mt-auto inline-flex min-h-[54px] items-center justify-center rounded-full bg-accent px-7 text-[15.5px] font-semibold text-accent-ink transition-[filter] hover:brightness-[1.04] active:scale-[0.985]"
            >
              Build this plan
            </Link>
            <p className="text-center text-xs text-panel-soft">
              Two minutes. Nothing moves until you approve it.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}

/**
 * One line of the sentence: a label, the value it currently reads, and the slider that sets it.
 *
 * The value sits above the track rather than in a box beside it, so the thing that changes is the
 * thing you are already looking at.
 */
function Dial({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
  lo,
  hi,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
  lo: string;
  hi: string;
}) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div>
      <label htmlFor={id} className="text-[14px] font-medium text-ink-muted">
        {label}
      </label>
      <div className="numeric mt-1 text-[26px] font-semibold text-ink sm:text-[30px]">{display}</div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="range mt-3"
        style={{
          ["--track" as string]: `linear-gradient(to right, var(--color-ink) ${pct}%, var(--color-line) ${pct}%)`,
        }}
      />
      <div className="mt-1 flex justify-between text-xs text-ink-muted">
        <span>{lo}</span>
        <span>{hi}</span>
      </div>
    </div>
  );
}
