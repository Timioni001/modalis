import Link from "next/link";
import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { SystemStatus } from "@/components/system-status";

export const metadata: Metadata = {
  description:
    "Set a goal and the limits you're comfortable with. Modalis builds the plan and stays inside them.",
};

/**
 * The landing page.
 *
 * Copy discipline: a heading of four words or fewer, one sentence under it, nothing else. Every
 * explanatory paragraph that was here has been cut — if a line needs a second line to explain it,
 * the first line was wrong.
 */
const STEPS = [
  { n: "01", title: "Say what it's for", body: "Four questions. No jargon." },
  { n: "02", title: "Approve the plan", body: "You see the limits before anything happens." },
  { n: "03", title: "Add money", body: "Split the way your plan says. You sign each step." },
  { n: "04", title: "It stays on plan", body: "Drifts off target, Modalis asks, you approve." },
];

const LIMITS = [
  { label: "Most you'd lose", body: "Before the plan gets cautious." },
  { label: "Kept available", body: "Always easy to withdraw." },
  { label: "Max in one thing", body: "However well it's doing." },
  { label: "When to step in", body: "How far off target is too far." },
];

export default function LandingPage() {
  return (
    <>
      <Hero />

      {/* ----------------------------------------------------------------- steps */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <h2 className="display text-3xl font-semibold text-ink sm:text-5xl">Four steps.</h2>

        <ol className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li key={step.n} className="border-t border-line pt-5">
              <div className="numeric text-sm font-semibold text-ink-muted">{step.n}</div>
              <h3 className="mt-3 text-xl font-semibold tracking-[-0.01em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- limits */}
      <section className="border-y border-line bg-surface-sunken">
        <div className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
          <h2 className="display text-3xl font-semibold text-ink sm:text-5xl">
            You set four limits.
          </h2>
          <p className="mt-5 max-w-md text-lg text-ink-soft">
            Modalis works inside them. It can&rsquo;t step outside.
          </p>

          <dl className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
            {LIMITS.map((limit) => (
              <div key={limit.label} className="bg-surface p-6">
                <dt className="font-semibold text-ink">{limit.label}</dt>
                <dd className="mt-1.5 text-sm text-ink-muted">{limit.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------- the claim */}
      <section className="bg-contrast text-contrast-ink">
        <div className="mx-auto max-w-6xl px-5 py-24 sm:py-32">
          <h2 className="display max-w-3xl text-4xl font-semibold sm:text-6xl">
            Modalis recommends.
            <br />
            <span className="text-contrast-soft">Your rules decide.</span>
          </h2>
          <p className="mt-8 max-w-lg text-lg text-contrast-soft">
            It can&rsquo;t move your money out. Not even if it&rsquo;s wrong.
          </p>
          <Link
            href="/security"
            className="mt-10 inline-flex min-h-[52px] items-center rounded-xl bg-accent px-7 text-[15px] font-semibold text-accent-ink transition-[filter] hover:brightness-105"
          >
            How that works
          </Link>
        </div>
      </section>

      {/* ------------------------------------------------------------ live status */}
      <section className="mx-auto max-w-6xl px-5 py-20 sm:py-28">
        <h2 className="display text-3xl font-semibold text-ink sm:text-5xl">What&rsquo;s running</h2>
        <p className="mt-5 max-w-md text-lg text-ink-soft">
          Read live. Anything off says so.
        </p>
        <div className="mt-10">
          <SystemStatus />
        </div>
      </section>

      {/* ------------------------------------------------------------- last word */}
      <section className="mx-auto max-w-6xl px-5 pb-24">
        <div className="rounded-3xl bg-surface-sunken px-6 py-16 text-center sm:px-14">
          <h2 className="display mx-auto max-w-lg text-3xl font-semibold text-ink sm:text-4xl">
            Start with the goal.
          </h2>
          <p className="mt-4 text-ink-soft">Two minutes. Nothing committed until you approve.</p>
          <Link
            href="/onboarding"
            className="mt-8 inline-flex min-h-[52px] items-center rounded-xl bg-accent px-8 text-[15px] font-semibold text-accent-ink transition-[filter] hover:brightness-105"
          >
            Build my plan
          </Link>
        </div>
      </section>
    </>
  );
}
