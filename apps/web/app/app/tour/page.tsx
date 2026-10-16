"use client";

/**
 * The 2-minute tour: the whole product promise, in order, on the real test network.
 *
 *   make a plan -> add money -> the market moves -> Modalis suggests a fix
 *   -> try to break your rules (the contract refuses) -> take money out
 *
 * Each step ticks itself off from live state where it can, so the tour is honest about where the
 * person actually is. The two demonstration steps call the same endpoints as the "Try it out" card
 * and are only offered on a demo deployment; the market move is a made-up price and says so.
 */
import { useState } from "react";
import { Badge, Button, Card, Notice, PageHeader } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { usePortfolio } from "@/components/portfolio-provider";
import { apiPost } from "@/lib/client-api";

type ScenarioResult = { title?: string; description?: string; receipts?: { reference: string }[] };
type SecurityResult = {
  stoppedByYourRules?: boolean;
  explanation?: string;
  moneyUnchanged?: boolean;
  receipt?: { reference: string };
};

export default function TourPage() {
  const { needsPlan, plan, money, adjustment, status, signedIn, refresh } = usePortfolio();
  const demo = Boolean(status?.demoMode);

  const [moved, setMoved] = useState<ScenarioResult | null>(null);
  const [tested, setTested] = useState<SecurityResult | null>(null);
  const [busy, setBusy] = useState<"move" | "test" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const hasPlan = Boolean(plan) && !needsPlan;
  const hasMoney = Boolean(money && !money.isEmpty);

  async function move() {
    setBusy("move");
    setError(null);
    try {
      setMoved(await apiPost<ScenarioResult>("/api/demo/scenario", { scenario: "off_target" }));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  async function test() {
    setBusy("test");
    setError(null);
    try {
      setTested(await apiPost<SecurityResult>("/api/demo/security-test"));
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "That didn't work.");
    } finally {
      setBusy(null);
    }
  }

  const steps: Step[] = [
    {
      title: "Name a goal and approve your plan",
      body: "Say what you're saving for and by when. Modalis turns it into a plan with four limits you approve, written into a contract on Monad.",
      done: hasPlan,
      action: hasPlan ? null : <Button href="/onboarding">Make my plan</Button>,
    },
    {
      title: "Add money",
      body: "Press “Get test money” first if your wallet is empty. Modalis splits what you add the way your plan says, and every step confirms in about a second.",
      done: hasMoney,
      locked: !hasPlan,
      action: hasMoney ? null : <Button href="/app/add-money">Add money</Button>,
    },
    {
      title: "The market moves",
      body: "One holding jumps in price, pushing your plan past one of its limits. The price is made up; your plan going off target because of it is real.",
      done: Boolean(moved),
      locked: !hasMoney,
      action: demo ? (
        <Button variant="secondary" onClick={move} busy={busy === "move"} busyLabel="Moving the market…" disabled={busy !== null}>
          Simulate a market move
        </Button>
      ) : (
        <DemoOnly />
      ),
      result: moved ? (
        <Notice tone="accent" title={moved.title ?? "The market moved"}>
          <p>{moved.description}</p>
          {moved.receipts?.map((r) => (
            <div key={r.reference} className="mt-1">
              <ReceiptLink reference={r.reference} />
            </div>
          ))}
        </Notice>
      ) : null,
    },
    {
      title: "Modalis suggests the fix",
      body: "Modalis notices within a block and proposes trades that bring you back inside your limits. With “Do it for me” on, it carries them out; the contract checks every one.",
      done: Boolean(moved) && !adjustment,
      locked: !moved,
      action: adjustment ? <Button href="/app">See the suggested fix</Button> : null,
    },
    {
      title: "Try to break your rules",
      body: "Modalis sends a correctly signed trade that breaks your limits. Your contract refuses it on-chain, and your money doesn't move.",
      done: Boolean(tested?.stoppedByYourRules),
      locked: !hasMoney,
      action: demo ? (
        <Button variant="danger" onClick={test} busy={busy === "test"} busyLabel="Testing…" disabled={busy !== null}>
          Test my rules
        </Button>
      ) : (
        <DemoOnly />
      ),
      result: tested ? (
        <Notice tone={tested.stoppedByYourRules ? "ok" : "breach"} title={tested.stoppedByYourRules ? "Your rules stopped it" : "Your rules did NOT stop it"}>
          <p>{tested.explanation}</p>
          {tested.receipt ? (
            <p className="mt-1">
              <ReceiptLink reference={tested.receipt.reference} /> &mdash; refused.
            </p>
          ) : null}
          <p className="mt-1">
            Your money is unchanged: <strong>{tested.moneyUnchanged ? "yes" : "no"}</strong>.
          </p>
        </Notice>
      ) : null,
    },
    {
      title: "Take money out",
      body: "Only you can withdraw, whenever you like. No Modalis key can move your money out.",
      done: false,
      locked: !hasMoney,
      action: <Button variant="secondary" href="/app/withdraw">Withdraw</Button>,
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="The 2-minute tour"
        lede="Everything Modalis does, in order, on the Monad test network. Every step is a real transaction you can open on the explorer."
      />
      {!signedIn ? <Notice tone="warn">Sign in first, then come back here.</Notice> : null}
      {error ? <Notice tone="breach">{error}</Notice> : null}

      <Card>
        <div className="mb-4 flex items-center justify-between">
          <span className="text-sm text-ink-muted">Your progress</span>
          <Badge tone={doneCount >= 5 ? "ok" : "default"}>
            {doneCount} of {steps.length}
          </Badge>
        </div>
        <ol className="space-y-px overflow-hidden rounded-2xl bg-line">
          {steps.map((step, i) => (
            <li key={step.title} className={`px-4 py-5 ${step.locked && !step.done ? "bg-sunken" : "bg-surface"}`}>
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                    step.done ? "bg-ok-soft text-ok" : "bg-sunken text-ink-muted"
                  }`}
                >
                  {step.done ? "✓" : i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="text-[15px] font-semibold text-ink">{step.title}</div>
                  <p className="mt-1 text-sm leading-relaxed text-ink-soft">{step.body}</p>
                  {step.action && !step.locked ? <div className="mt-3">{step.action}</div> : null}
                  {step.result ? <div className="mt-3">{step.result}</div> : null}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </Card>
    </div>
  );
}

type Step = {
  title: string;
  body: string;
  done: boolean;
  locked?: boolean;
  action?: React.ReactNode;
  result?: React.ReactNode;
};

function DemoOnly() {
  return (
    <p className="text-xs text-ink-muted">
      This step is switched on for demonstration deployments only.
    </p>
  );
}
