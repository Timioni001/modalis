"use client";

/**
 * The hero.
 *
 * Don't describe the product — run it. The headline is the form: someone states their goal in a
 * sentence and the card answers straight away, with no sign-up and no wallet.
 *
 * Two things keep it honest. It uses the REAL engine — `project()` is the same function the
 * signed-in product uses, so there is no second implementation to drift. And it assumes zero
 * growth, so the only figure it shows is money the person adds themselves.
 */
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { project } from "@modalis/domain";
import type { SystemStatus } from "@/lib/api-types";

const E18 = 10n ** 18n;
const usd = (n: number) => BigInt(Math.max(0, Math.round(n))) * E18;

type GoalPreset = { id: string; label: string; amount: number; years: number };

const GOALS: GoalPreset[] = [
  { id: "house", label: "a home", amount: 40_000, years: 5 },
  { id: "emergency_reserve", label: "a safety net", amount: 10_000, years: 2 },
  { id: "education", label: "education", amount: 25_000, years: 4 },
  { id: "long_term_wealth", label: "the long term", amount: 100_000, years: 10 },
];

export function Hero() {
  const [goal, setGoal] = useState<GoalPreset>(GOALS[0]);
  const [amount, setAmount] = useState<number>(GOALS[0].amount);
  const [years, setYears] = useState<number>(GOALS[0].years);
  const [monthly, setMonthly] = useState<number>(400);

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

  const onTrack = projection.shortfallE18 === 0n;
  const covered = amount === 0 ? 0 : Math.min(100, ((monthly * months) / amount) * 100);

  const handoff = new URLSearchParams({
    goal: goal.id,
    amount: String(amount),
    months: String(months),
    monthly: String(monthly),
  }).toString();

  return (
    <section className="relative overflow-hidden bg-[#0c0e13] text-[#f4f4f2]">
      <div aria-hidden className="grid-field-dark pointer-events-none absolute inset-0" />

      <div className="relative mx-auto max-w-6xl px-5 pt-16 sm:pt-24">
        {/* ------------------------------------------------------------ the claim */}
        <div className="mx-auto max-w-3xl text-center">
          <h1 className="display text-[2.75rem] font-semibold leading-[0.95] sm:text-7xl lg:text-[5.25rem]">
            Your goal.
            <br />
            <span className="text-[#8b919c]">Managed for you.</span>
          </h1>
          <p className="mx-auto mt-7 max-w-md text-lg text-[#b4bac4]">
            Set the limits. Modalis stays inside them.
          </p>
        </div>

        {/* -------------------------------------------- the sentence is the form */}
        <div className="mx-auto mt-14 max-w-4xl">
          <div className="flex flex-wrap justify-center gap-2">
            {GOALS.map((option) => (
              <button
                key={option.id}
                type="button"
                onClick={() => {
                  setGoal(option);
                  setAmount(option.amount);
                  setYears(option.years);
                }}
                aria-pressed={goal.id === option.id}
                className={`min-h-[40px] rounded-full border px-4 text-sm font-medium transition-colors ${
                  goal.id === option.id
                    ? "border-transparent bg-[#f4f4f2] text-[#10131a]"
                    : "border-[#2a2f3a] text-[#b4bac4] hover:border-[#3d4350] hover:text-[#f4f4f2]"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>

          <p className="mt-9 text-center text-2xl leading-[1.8] sm:text-3xl">
            I want{" "}
            <Amount
              label="How much you want to save"
              value={amount}
              min={500}
              max={5_000_000}
              onChange={setAmount}
            />{" "}
            <span className="text-[#8b919c]">for {goal.label} by</span>{" "}
            <Year value={years} onChange={setYears} />
            <span className="text-[#8b919c]">, adding</span>{" "}
            <Amount
              label="How much you can add each month"
              value={monthly}
              min={0}
              max={100_000}
              onChange={setMonthly}
            />{" "}
            <span className="text-[#8b919c]">a month.</span>
          </p>
        </div>

        {/* --------------------------------------------------------- the answer */}
        <div className="mx-auto mt-12 max-w-xl">
          <div className="rounded-2xl border border-[#242833] bg-[#14171e] p-6 sm:p-7">
            <div className="flex items-start justify-between gap-4">
              <div aria-live="polite">
                <div className="text-sm text-[#8b919c]">You&rsquo;d need</div>
                <div className="numeric mt-1 text-5xl font-semibold tracking-[-0.03em] sm:text-6xl">
                  ${Math.round(Number(projection.requiredMonthly.amount)).toLocaleString("en-US")}
                  <span className="ml-2 text-xl font-medium text-[#8b919c]">/mo</span>
                </div>
              </div>
              <span
                className={`mt-1.5 inline-flex flex-none items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ${
                  onTrack ? "bg-[#d6f34a] text-[#10131a]" : "bg-[#2a2f3a] text-[#d9ded8]"
                }`}
              >
                <span
                  aria-hidden
                  className={`h-1.5 w-1.5 rounded-full ${onTrack ? "bg-[#10131a]" : "bg-[#d6f34a]"}`}
                />
                {onTrack
                  ? "Covered"
                  : `$${Math.round(Number(projection.extraMonthly.amount)).toLocaleString("en-US")} short`}
              </span>
            </div>

            <div className="mt-7">
              <div
                role="progressbar"
                aria-valuenow={Math.round(covered)}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="How much of your goal your contributions cover"
                className="h-1.5 w-full overflow-hidden rounded-full bg-[#242833]"
              >
                <div
                  className="h-full rounded-full bg-[#d6f34a] transition-[width] duration-500"
                  style={{ width: `${covered}%`, transitionTimingFunction: "var(--ease-out-soft)" }}
                />
              </div>
              <div className="numeric mt-3 flex justify-between text-sm text-[#8b919c]">
                <span>${(monthly * months).toLocaleString("en-US")} in</span>
                <span>${amount.toLocaleString("en-US")} goal</span>
              </div>
            </div>
          </div>

          <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href={`/onboarding?${handoff}`}
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl bg-[#d6f34a] px-8 text-[15px] font-semibold text-[#10131a] transition-[filter] hover:brightness-105 sm:w-auto"
            >
              Build my plan
            </Link>
            <Link
              href="/how-it-works"
              className="inline-flex min-h-[52px] w-full items-center justify-center rounded-xl border border-[#2a2f3a] px-8 text-[15px] font-semibold text-[#f4f4f2] transition-colors hover:border-[#3d4350] sm:w-auto"
            >
              How it works
            </Link>
          </div>

          <p className="mt-6 text-center text-sm text-[#707887]">No growth assumed.</p>
        </div>

        <StatBar />
      </div>
    </section>
  );
}

/**
 * The strip along the bottom.
 *
 * Four facts, each of them true and checkable. No user count and no money-under-management: this
 * product has neither, and inventing them would undermine the only thing it is selling. The last
 * one is read from the running deployment rather than written here.
 */
function StatBar() {
  const [status, setStatus] = useState<SystemStatus | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => alive && setStatus(d as SystemStatus))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  const live = status?.network.reachable;
  const block = status?.network.blockNumber;

  const stats = [
    { value: "4", label: "Limits you set" },
    { value: "$0", label: "Fees" },
    { value: "Anytime", label: "Withdrawals" },
    {
      value: live === undefined ? "—" : live ? "Live" : "Offline",
      label: block ? `Block ${block}` : (status?.network.name ?? "Network"),
    },
  ];

  return (
    <div className="mt-20 grid grid-cols-2 gap-px overflow-hidden rounded-t-2xl border-x border-t border-[#242833] bg-[#242833] sm:grid-cols-4">
      {stats.map((stat) => (
        <div key={stat.label} className="bg-[#0c0e13] px-5 py-7 text-center">
          <div className="numeric text-2xl font-semibold sm:text-3xl">{stat.value}</div>
          <div className="mt-1.5 truncate text-xs text-[#707887]">{stat.label}</div>
        </div>
      ))}
    </div>
  );
}

/**
 * A number that lives inside a sentence.
 *
 * `type="text"` with `inputMode="numeric"` rather than `type="number"`, so the value can carry
 * thousands separators — "$40000" reads like a database field, "$40,000" reads like money. The
 * numeric keypad still comes up on a phone, and no spinner arrows break the baseline.
 */
function Amount({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const display = value.toLocaleString("en-US");
  const id = `amount-${label.replace(/\W+/g, "-").toLowerCase()}`;

  return (
    <span className="inline-flex items-baseline">
      <label className="sr-only" htmlFor={id}>
        {label}
      </label>
      <span aria-hidden className="font-semibold">
        $
      </span>
      <input
        id={id}
        type="text"
        inputMode="numeric"
        autoComplete="off"
        value={display}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^\d]/g, "");
          onChange(digits === "" ? min : Math.min(max, Number(digits.slice(0, 9))));
        }}
        onBlur={() => onChange(Math.min(max, Math.max(min, value)))}
        className="numeric w-[var(--w)] border-b-2 border-dashed border-[#3d4350] bg-transparent pb-1 font-semibold text-[#f4f4f2] outline-none transition-colors focus:border-solid focus:border-[#d6f34a]"
        style={{ ["--w" as string]: `${Math.max(3, display.length + 0.5)}ch` }}
      />
    </span>
  );
}

function Year({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const thisYear = new Date().getFullYear();
  return (
    <span className="relative inline-flex items-baseline">
      <label className="sr-only" htmlFor="field-year">
        The year you need it by
      </label>
      <select
        id="field-year"
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="numeric cursor-pointer appearance-none border-b-2 border-dashed border-[#3d4350] bg-transparent pb-1 pr-[1.1em] font-semibold text-[#f4f4f2] outline-none transition-colors focus:border-solid focus:border-[#d6f34a]"
      >
        {Array.from({ length: 29 }, (_, i) => i + 2).map((y) => (
          <option key={y} value={y} className="bg-[#14171e]">
            {thisYear + y}
          </option>
        ))}
      </select>
      <svg
        aria-hidden
        width="10"
        height="10"
        viewBox="0 0 10 10"
        className="pointer-events-none absolute right-[0.15em] top-1/2 -translate-y-1/2 text-[#707887]"
      >
        <path
          d="M2 4l3 3 3-3"
          stroke="currentColor"
          strokeWidth="1.6"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}
