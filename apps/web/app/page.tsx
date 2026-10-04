import Link from "next/link";
import { Badge, Card } from "@/components/ui";
import { SystemStatus } from "@/components/system-status";

export default function LandingPage() {
  return (
    <div className="mx-auto max-w-6xl px-5">
      {/* ------------------------------------------------------------- hero */}
      <section className="py-20 sm:py-28">
        <Badge tone="accent">Onchain Finance &amp; Trading · built on Monad</Badge>
        <h1 className="mt-6 max-w-3xl text-5xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-6xl">
          Your goals. Your money. Managed.
        </h1>
        <p className="mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft">
          Tell Modalis what you&rsquo;re investing for. It builds a portfolio around your goal and
          keeps it within the rules you approve.
        </p>

        <div className="mt-9 flex flex-wrap items-center gap-3">
          <Link
            href="/onboarding"
            className="inline-flex items-center justify-center rounded-xl bg-accent px-6 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-[#1a44ba]"
          >
            Build my portfolio
          </Link>
          <Link
            href="/portfolio"
            className="inline-flex items-center justify-center rounded-xl border border-line px-6 py-3.5 text-sm font-semibold text-ink transition-colors hover:bg-surface-sunken"
          >
            I already have a portfolio
          </Link>
        </div>

        <p className="mt-8 max-w-2xl text-sm leading-relaxed text-ink-muted">
          No wallet needed to start &mdash; continue with your email and Modalis creates a Monad
          wallet you own.
        </p>
      </section>

      {/* ------------------------------------------------- the actual thesis */}
      <section className="border-t border-line py-16">
        <div className="grid gap-10 sm:grid-cols-3">
          <div>
            <h2 className="text-base font-semibold text-ink">AI decides what should happen.</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              It reads your goal, builds an allocation around it, watches the portfolio, and
              explains every action in plain language.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Smart contracts decide what is allowed.</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Your limits become an onchain mandate. Any action outside it is rejected by the
              contract, not by a policy document. The AI never gets unrestricted control of funds.
            </p>
          </div>
          <div>
            <h2 className="text-base font-semibold text-ink">Monad settles what happens.</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              Your positions, rules and every state change live on Monad. Fast, low-cost settlement
              is what makes a continuously maintained portfolio practical onchain.
            </p>
          </div>
        </div>
      </section>

      {/* --------------------------------------------------- the mandate idea */}
      <section className="border-t border-line py-16">
        <div className="grid gap-10 lg:grid-cols-[1.1fr_1fr] lg:items-start">
          <div>
            <h2 className="text-3xl font-semibold tracking-tight text-ink">
              The Portfolio Mandate
            </h2>
            <p className="mt-4 text-ink-soft">
              Most people can say what they need their money to do. Far fewer can say which assets
              to own, how much risk they can afford, or when to rebalance.
            </p>
            <p className="mt-4 text-ink-soft">
              Modalis turns your answers into a machine-enforceable investment policy: a target, a
              date, a drawdown ceiling, a liquidity floor, a concentration limit and a rebalance
              threshold. That policy is stored onchain, and it is what bounds everything Modalis
              can do on your behalf.
            </p>
            <p className="mt-4 text-ink-soft">
              You keep withdrawal authority at all times. The manager key that proposes rebalances
              cannot withdraw your funds or change your rules &mdash; the contract refuses.
            </p>
          </div>

          <Card className="bg-surface-sunken">
            <div className="text-[13px] font-semibold uppercase tracking-[0.08em] text-ink-muted">
              How a rebalance actually happens
            </div>
            <ol className="mt-5 space-y-4 text-sm">
              {[
                ["Monitoring", "A Chainlink CRE workflow and the Modalis risk engine read your real onchain positions."],
                ["Breach", "An asset drifts past a limit you approved."],
                ["Proposal", "Modalis builds the smallest trade that returns the portfolio to compliance, and explains why."],
                ["Validation", "The mandate contract checks the result. Outside your rules, the whole transaction reverts."],
                ["Execution", "A valid trade settles through the configured venue on Monad."],
                ["Updated state", "Your dashboard reflects the new positions, with the transaction to verify it."],
              ].map(([title, body], i) => (
                <li key={title} className="flex gap-3">
                  <span className="numeric mt-0.5 flex h-6 w-6 flex-none items-center justify-center rounded-full bg-white text-xs font-semibold text-accent">
                    {i + 1}
                  </span>
                  <span>
                    <span className="font-semibold text-ink">{title}.</span>{" "}
                    <span className="text-ink-soft">{body}</span>
                  </span>
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </section>

      {/* -------------------------------------------------------- live status */}
      <section className="border-t border-line py-16">
        <h2 className="text-3xl font-semibold tracking-tight text-ink">What is live right now</h2>
        <p className="mt-3 max-w-2xl text-ink-soft">
          Read from this deployment, not from a feature list. Anything unconfigured says so.
        </p>
        <div className="mt-8">
          <SystemStatus />
        </div>
      </section>
    </div>
  );
}
