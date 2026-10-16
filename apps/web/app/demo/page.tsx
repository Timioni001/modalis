"use client";

import { useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Badge, Button, Card, MoneyField, Notice } from "@/components/ui";
import { WalletButton } from "@/components/wallet-button";
import { useWallet } from "@/components/wallet-context";
import {
  SavingsPreferencesFields,
  SavingsPreferencesSummary,
} from "@/components/savings-preferences";
import {
  DEFAULT_SAVINGS_PREFERENCES,
  savingsPreferenceProblem,
} from "@modalis/domain/client";

/** A sandbox preview: no session, balance API, signing, persistence or synthetic receipts. */
export default function DemoPage() {
  const reducedMotion = useReducedMotion();
  const { loggedIn, configured } = useWallet();
  const [monthly, setMonthly] = useState(100);
  const [savings, setSavings] = useState(DEFAULT_SAVINGS_PREFERENCES);
  const savingsProblem = savingsPreferenceProblem(savings);
  const [tab, setTab] = useState<"goal" | "payments" | "rules">("goal");
  const saved = 200;
  const projected = saved + monthly * 18;
  return (
    <div className="mx-auto max-w-5xl space-y-6 px-5 py-10 sm:py-16">
      <div className="max-w-2xl space-y-4">
        <Badge tone="warn">Interactive preview · sample data</Badge>
        <h1 className="text-4xl font-semibold tracking-tight sm:text-6xl">
          A clear plan.
          <br />
          <span className="text-ink-muted">A calmer way to save.</span>
        </h1>
        <p className="text-base text-ink-soft">
          Explore Modalis without an account. These numbers are examples.
          Nothing here moves money or writes to the blockchain.
        </p>
      </div>
      <div
        role="tablist"
        aria-label="Explore the demo"
        className="flex max-w-full gap-1 rounded-full bg-sunken p-1"
      >
        {(["goal", "payments", "rules"] as const).map((item, index, all) => (
          <button
            key={item}
            id={`demo-${item}`}
            role="tab"
            aria-controls={`panel-${item}`}
            aria-selected={tab === item}
            tabIndex={tab === item ? 0 : -1}
            onClick={() => setTab(item)}
            onKeyDown={(event) => {
              let next = index;
              if (event.key === "ArrowRight") next = (index + 1) % all.length;
              else if (event.key === "ArrowLeft")
                next = (index + all.length - 1) % all.length;
              else if (event.key === "Home") next = 0;
              else if (event.key === "End") next = all.length - 1;
              else return;
              event.preventDefault();
              setTab(all[next]);
              document.getElementById(`demo-${all[next]}`)?.focus();
            }}
            className={`relative min-h-11 flex-1 rounded-full px-3 text-sm font-semibold ${tab === item ? "text-panel-ink" : "text-ink-soft"}`}
          >
            {tab === item ? (
              <motion.span
                layoutId="demo-tab"
                className="absolute inset-0 rounded-full bg-panel"
                aria-hidden
              />
            ) : null}
            <span className="relative">
              {item === "goal"
                ? "Your goal"
                : item === "payments"
                  ? "Payments"
                  : "Your rules"}
            </span>
          </button>
        ))}
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={tab}
          role="tabpanel"
          tabIndex={0}
          id={`panel-${tab}`}
          aria-labelledby={`demo-${tab}`}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15 }}
        >
          {tab === "goal" ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <div className="rounded-[28px] bg-panel p-7 text-panel-ink">
                <p className="text-sm text-panel-soft">
                  Sample goal · emergency fund
                </p>
                <h2 className="mt-3 text-5xl font-semibold tabular-nums">
                  $2,000
                </h2>
                <p className="mt-5 text-sm text-panel-soft">
                  $200 saved · 18 months to go
                </p>
                <div className="my-5 h-2 overflow-hidden rounded-full bg-panel-soft/25">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${Math.min(100, projected / 20)}%` }}
                    transition={{ duration: reducedMotion ? 0 : 0.35 }}
                  />
                </div>
                <p className="text-lg font-semibold tabular-nums">
                  ${projected.toLocaleString("en-US")} from contributions
                </p>
                <p className="mt-2 text-sm text-panel-soft">
                  An arithmetic example, assuming no growth, fees or
                  withdrawals.
                </p>
              </div>
              <Card>
                <h2 className="text-xl font-semibold">Make the plan yours</h2>
                <label
                  htmlFor="demo-monthly"
                  className="mb-3 mt-5 block text-sm"
                >
                  Add each month (sample dollars)
                </label>
                <MoneyField
                  id="demo-monthly"
                  value={monthly}
                  max={1000}
                  onChange={setMonthly}
                />
                <p className="mt-5 text-sm text-ink-soft">
                  Change the amount and see how regular contributions move you
                  toward your goal.
                </p>
              </Card>
            </div>
          ) : tab === "payments" ? (
            <Card>
              <h2 className="text-2xl font-semibold">
                Send. Request. Save together.
              </h2>
              <p className="my-4 text-ink-soft">
                Create a shareable request, review the recipient and amount, and
                approve a testnet transfer yourself. Savings circles pay each
                member in order and offer refunds when a round fails.
              </p>
              <Button href="/app/payments">Explore testnet payments</Button>
            </Card>
          ) : (
            <Card>
              <h2 className="text-2xl font-semibold">You set the boundaries</h2>
              <ul className="my-5 grid gap-3 text-sm sm:grid-cols-2">
                {[
                  "Keep a cash reserve",
                  "Limit any single holding",
                  "Limit trading costs",
                  "Pause or revoke adjustments",
                ].map((rule) => (
                  <li key={rule} className="rounded-2xl bg-sunken p-4">
                    ✓ {rule}
                  </li>
                ))}
              </ul>
              <div className="my-5 space-y-4">
                <SavingsPreferencesFields
                  value={savings}
                  onChange={setSavings}
                  id="demo-savings"
                />
                {savingsProblem ? (
                  <Notice tone="warn">{savingsProblem}</Notice>
                ) : (
                  <SavingsPreferencesSummary savings={savings} />
                )}
                <p className="text-sm text-ink-muted">
                  Sample preferences only. Nothing is saved. Set your own values
                  when creating a testnet plan.
                </p>
              </div>
              <Button variant="secondary" href="/security">
                See how the contracts enforce them
              </Button>
            </Card>
          )}
        </motion.div>
      </AnimatePresence>
      <Card>
        <h2 className="text-xl font-semibold">
          Try real transactions on the test network
        </h2>
        <p className="my-4 text-sm text-ink-soft">
          The preview above uses sample data. The testnet demo uses valueless
          tokens and asks you to sign each transaction. Modalis is not a live
          financial product.
        </p>
        <div className="flex flex-wrap gap-3">
          {loggedIn ? (
            <>
              <WalletButton signIn />
              <Button href="/app">Open testnet demo</Button>
              <Button variant="secondary" href="/onboarding">
                Create a plan
              </Button>
            </>
          ) : configured ? (
            <Button href="/app">Enter testnet demo</Button>
          ) : (
            <Notice tone="warn">
              Testnet sign-in isn't configured on this deployment. The
              interactive preview is available above.
            </Notice>
          )}
          <Button variant="quiet" href="/how-it-works">
            How it works
          </Button>
        </div>
      </Card>
    </div>
  );
}
