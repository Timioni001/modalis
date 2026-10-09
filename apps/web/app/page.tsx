import Link from "next/link";
import type { Metadata } from "next";
import { Hero } from "@/components/hero";
import { SystemStatus } from "@/components/system-status";
import { DotShader } from "@/components/shadcn/dot-shader";
import { RainbowButton } from "@/components/shadcn/rainbow-button";
import { CardFan, DiscStack, PillArc } from "@/components/live-visuals";

export const metadata: Metadata = {
  description:
    "Tell Modalis what you're saving for and the risk you're comfortable with. It builds the plan and keeps your money within your limits.",
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
  { n: "01", title: "Set your goal", body: "Answer four short questions about what you're saving for and when." },
  { n: "02", title: "Review your plan", body: "See how your money will be invested and the limits that apply." },
  { n: "03", title: "Add money", body: "Deposit from your own wallet. You approve every transaction." },
  { n: "04", title: "Stay on track", body: "If your plan drifts, Modalis suggests a fix and waits for you." },
];

const LIMITS = [
  { label: "Maximum loss", value: "15%", body: "Past this point, the plan becomes more cautious." },
  { label: "Kept available", value: "30%", body: "Held as cash so you can withdraw it at any time." },
  { label: "Largest single holding", value: "40%", body: "No one investment can grow beyond this share." },
  { label: "Rebalancing point", value: "5%", body: "How far the plan may drift before Modalis acts." },
];

const CANNOT = [
  "Send your money to an address you haven't approved",
  "Go beyond a limit you've set",
  "Keep trading after you pause your plan",
  "Change your limits without you",
];

const FEATURES = [
  {
    title: "Your plan keeps running.",
    body: "Choose a goal and a date. Modalis works out how much to set aside and how to invest it, then keeps the plan on schedule.",
    Visual: PillArc,
  },
  {
    title: "Your limits hold.",
    body: "Each limit is stored in a smart contract on Monad. Modalis cannot move past it, even when the market moves quickly.",
    Visual: DiscStack,
  },
  {
    title: "Every holding is watched.",
    body: "Modalis checks each investment against your plan and tells you, in plain terms, when something needs your attention.",
    Visual: CardFan,
  },
];

export default function LandingPage() {
  return (
    <div className="landing-dots">
      <Hero />

      {/* ------------------------------------------------------- live visuals */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="display max-w-2xl text-[2.2rem] font-semibold text-ink sm:text-6xl">
          Your money, managed with <span className="accent-serif">care.</span>
        </h2>
        <div className="mt-12 grid gap-10 lg:grid-cols-3 lg:gap-6">
          {FEATURES.map(({ title, body, Visual }) => (
            <article key={title}>
              <div className="flex items-center justify-center overflow-hidden rounded-[28px] bg-canvas p-6 sm:p-10">
                <Visual />
              </div>
              <h3 className="mt-6 text-[21px] font-semibold tracking-[-0.02em] text-ink">{title}</h3>
              <p className="mt-2 text-[15.5px] leading-relaxed text-ink-soft">{body}</p>
            </article>
          ))}
        </div>
      </section>

      {/* ----------------------------------------------------------------- steps */}
      <section className="mx-auto max-w-6xl px-5 py-16 sm:py-24">
        <h2 className="display text-[2rem] font-semibold text-ink sm:text-5xl">How it works</h2>

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
              Four limits. <span className="accent-serif">Yours.</span>
            </h2>
            <p className="mt-5 max-w-sm text-[17px] leading-relaxed text-ink-soft">
              You choose them when you create your plan. Modalis works within them and cannot
              change them.
            </p>
            <Link
              href="/how-it-works"
              className="mt-7 inline-flex min-h-[46px] items-center rounded-full bg-panel px-5 text-[14.5px] font-semibold text-panel-ink transition-opacity hover:opacity-90"
            >
              See an example plan
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
                Modalis suggests.
                <br />
                <span className="text-panel-soft">You decide.</span>
              </h2>
              <p className="mt-7 max-w-md text-[17px] leading-relaxed text-panel-soft">
                Your limits are stored in a smart contract on Monad. Modalis has no way to change
                them, and only you can withdraw your money.
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
          System status
        </h2>
        <p className="mt-4 max-w-md text-[17px] text-ink-soft">Checked live each time you load this page.</p>
        <div className="mt-9">
          <SystemStatus />
        </div>
      </section>

      {/* ------------------------------------------------------------- last word */}
      <section className="mx-auto max-w-6xl px-5 pb-20 sm:pb-28">
        <div className="rounded-[32px] bg-canvas px-6 py-16 text-center sm:px-14">
          <h2 className="display mx-auto max-w-lg text-[2rem] font-semibold text-ink sm:text-[2.75rem]">
            Start with your <span className="accent-serif">goal.</span>
          </h2>
          <p className="mt-4 text-ink-soft">It takes about two minutes, and nothing happens until you approve.</p>
          <div className="mt-8 flex justify-center">
            <RainbowButton asChild size="lg" className="rounded-full">
              <Link href="/onboarding">Create my plan</Link>
            </RainbowButton>
          </div>
        </div>
      </section>
    </div>
  );
}
