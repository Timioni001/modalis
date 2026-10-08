import Link from "next/link";
import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { SystemStatus } from "@/components/system-status";
import { DotShader } from "@/components/shadcn/dot-shader";
import { RainbowButton } from "@/components/shadcn/rainbow-button";

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
 *
 * Structure follows the mental model in order: goal, plan, money, progress, adjustments. Someone
 * scrolling once should come away knowing what happens to their money and who decides.
 */
const STEPS = [
  { n: "01", title: "Say what it's for", body: "Four questions. No jargon." },
  { n: "02", title: "Approve the plan", body: "You see the limits before anything happens." },
  { n: "03", title: "Add money", body: "Split the way your plan says. You sign each step." },
  { n: "04", title: "It stays on plan", body: "Drifts off target, Modalis asks, you approve." },
];

const LIMITS = [
  { label: "Most you'd lose", value: "15%", body: "Before the plan gets cautious." },
  { label: "Kept available", value: "30%", body: "Always easy to withdraw." },
  { label: "Max in one thing", value: "40%", body: "However well it's doing." },
  { label: "When to step in", value: "5%", body: "How far off target is too far." },
];

const CANNOT = [
  "Move your money to an address you didn't approve",
  "Go past a limit you set",
  "Keep going after you pause it",
  "Change your limits on its own",
];

export default function LandingPage() {
  return (
    <>
      <Hero />

      {/* ----------------------------------------------------------------- steps */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="display text-[2rem] font-semibold text-ink sm:text-5xl">Four steps.</h2>

        <ol className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {STEPS.map((step) => (
            <li
              key={step.n}
              className="rounded-[24px] bg-canvas p-6"
            >
              <div className="numeric text-[13px] font-semibold text-ink-muted">{step.n}</div>
              <h3 className="mt-6 text-[19px] font-semibold tracking-[-0.015em] text-ink">
                {step.title}
              </h3>
              <p className="mt-2 text-[14.5px] leading-relaxed text-ink-soft">{step.body}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ---------------------------------------------------------------- limits */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_1fr] lg:items-center">
          <div>
            <h2 className="display text-[2rem] font-semibold text-ink sm:text-5xl">
              You set four <span className="accent-serif">limits.</span>
            </h2>
            <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-ink-soft">
              Modalis works inside them. It can&rsquo;t step outside.
            </p>
            <Link
              href="/how-it-works"
              className="mt-7 inline-flex min-h-[46px] items-center rounded-full bg-panel px-5 text-[14.5px] font-semibold text-panel-ink transition-opacity hover:opacity-90"
            >
              See a real plan
            </Link>
          </div>

          <dl className="grid gap-4 sm:grid-cols-2">
            {LIMITS.map((limit) => (
              <div
                key={limit.label}
                className="rounded-[24px] bg-canvas p-6"
              >
                <div className="numeric text-[34px] font-semibold leading-none text-ink">
                  {limit.value}
                </div>
                <dt className="mt-4 font-semibold text-ink">{limit.label}</dt>
                <dd className="mt-1 text-[14px] text-ink-muted">{limit.body}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ------------------------------------------------------------- the claim */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24">
        <DotShader
          className="rounded-[32px] bg-panel text-panel-ink shadow-[var(--shadow-lift)]"
          dotColor="rgba(255,255,255,0.09)"
          accentColor="#c8f250"
          overlay={false}
        >
          <div className="grid w-full gap-10 px-6 py-14 sm:px-12 sm:py-20 lg:grid-cols-[1fr_minmax(0,380px)] lg:gap-16">
            <div>
              <h2 className="display text-[2.25rem] font-semibold sm:text-6xl">
                Modalis recommends.
                <br />
                <span className="text-panel-soft">Your rules decide.</span>
              </h2>
              <p className="mt-7 max-w-md text-[17px] leading-relaxed text-panel-soft">
                The limits live in a contract on Monad. Modalis has no authority to change them —
                not even when it&rsquo;s right.
              </p>
              <Link
                href="/security"
                className="mt-9 inline-flex min-h-[52px] items-center rounded-full bg-accent px-7 text-[15px] font-semibold text-accent-ink transition-[filter] hover:brightness-[1.04]"
              >
                How that works
              </Link>
            </div>

            <div>
              <div className="text-[13px] font-semibold uppercase tracking-[0.09em] text-panel-soft">
                What it cannot do
              </div>
              <ul className="mt-5 space-y-px overflow-hidden rounded-2xl">
                {CANNOT.map((line) => (
                  <li
                    key={line}
                    className="flex items-start gap-3 bg-panel-line/50 px-4 py-3.5 text-[14.5px] leading-snug"
                  >
                    <svg
                      aria-hidden
                      viewBox="0 0 16 16"
                      className="mt-0.5 h-4 w-4 flex-none text-accent"
                      fill="none"
                    >
                      <circle cx="8" cy="8" r="6.6" stroke="currentColor" strokeWidth="1.5" />
                      <path
                        d="M5.6 5.6l4.8 4.8M10.4 5.6l-4.8 4.8"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        strokeLinecap="round"
                      />
                    </svg>
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </DotShader>
      </section>

      {/* ------------------------------------------------------------ live status */}
      <section className="mx-auto max-w-6xl px-5 pb-16 sm:pb-24">
        <h2 className="display text-[2rem] font-semibold text-ink sm:text-5xl">
          What&rsquo;s running
        </h2>
        <p className="mt-4 max-w-md text-[17px] text-ink-soft">Read live. Anything off says so.</p>
        <div className="mt-9">
          <SystemStatus />
        </div>
      </section>

      {/* ------------------------------------------------------------- last word */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:pb-28">
        <div className="rounded-[32px] bg-canvas px-6 py-16 text-center sm:px-14">
          <h2 className="display mx-auto max-w-lg text-[2rem] font-semibold text-ink sm:text-[2.75rem]">
            Start with the <span className="accent-serif">goal.</span>
          </h2>
          <p className="mt-4 text-ink-soft">Two minutes. Nothing committed until you approve.</p>
          <div className="mt-8 flex justify-center">
            <RainbowButton asChild size="lg" className="rounded-full">
              <Link href="/onboarding">Build my plan</Link>
            </RainbowButton>
          </div>
        </div>
      </section>
    </>
  );
}
