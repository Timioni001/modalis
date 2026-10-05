"use client";

/**
 * "What if?" — answered against the person's real goal.
 *
 * The questions are a closed set on purpose. A free-text box invites questions this engine cannot
 * answer honestly — "what if the market goes up 20%?" has no answer that isn't a guess — so the
 * product only offers the questions it can answer from money the person controls.
 *
 * Nothing here changes a plan. Changing one needs their approval and their signature.
 */
import { useCallback, useEffect, useState } from "react";
import type { Scenario, ScenarioResult } from "@modalis/domain";
import { Badge, Button, Card, Failure, Loading, Notice, SectionTitle } from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { apiPost, ApiError } from "@/lib/client-api";

type ScenarioSet = {
  available: Scenario[];
  result: ScenarioResult | null;
  assumption: string;
};

export default function ScenariosPage() {
  return (
    <PortfolioGate>
      <Scenarios />
    </PortfolioGate>
  );
}

function Scenarios() {
  const [set, setSet] = useState<ScenarioSet | null>(null);
  const [asked, setAsked] = useState<Scenario | null>(null);
  const [result, setResult] = useState<ScenarioResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    apiPost<ScenarioSet>("/api/goal/scenarios", {})
      .then((d) => alive && setSet(d))
      .catch((err: unknown) => {
        if (!alive) return;
        setError(err instanceof ApiError ? err.message : "We couldn't load your goal.");
      });
    return () => {
      alive = false;
    };
  }, []);

  const ask = useCallback(async (scenario: Scenario) => {
    setBusy(true);
    setError(null);
    setAsked(scenario);
    try {
      const answered = await apiPost<ScenarioSet>("/api/goal/scenarios", {
        kind: scenario.kind,
        ...(scenario.amount !== undefined ? { amount: String(scenario.amount) } : {}),
        ...(scenario.months !== undefined ? { months: scenario.months } : {}),
      });
      setResult(answered.result);
    } catch (err) {
      setResult(null);
      setError(err instanceof ApiError ? err.message : "We couldn't work that out.");
    } finally {
      setBusy(false);
    }
  }, []);

  if (!set && !error) return <Loading label="Loading your goal" />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="display text-3xl font-semibold text-ink">What if?</h1>
        <p className="mt-2 max-w-xl text-ink-soft">
          Change one thing and see what it would do to your goal. Nothing here touches your real
          plan.
        </p>
      </div>

      {error ? (
        <Failure
          title="We couldn't answer that"
          meaning="Your plan and your money are unchanged — this screen only does arithmetic."
          next="Try again, or pick a different question."
        />
      ) : null}

      {set ? (
        <Card>
          <SectionTitle>Pick a question</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {set.available.map((scenario) => {
              const active = asked?.kind === scenario.kind;
              return (
                <button
                  key={scenario.kind}
                  type="button"
                  onClick={() => ask(scenario)}
                  disabled={busy}
                  aria-pressed={active}
                  className={`min-h-[44px] rounded-xl border px-4 text-sm font-medium transition-colors disabled:opacity-60 ${
                    active
                      ? "border-ink bg-ink text-surface"
                      : "border-line text-ink-soft hover:bg-surface-sunken hover:text-ink"
                  }`}
                >
                  {scenario.question}
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      {busy && !result ? <Loading label="Working it out" /> : null}

      {result ? (
        <>
          {/* The answer, as a sentence, before any numbers. */}
          <Card className={result.fixesTheGoal ? "border-ok/40 bg-ok-soft/40" : ""}>
            <div className="flex items-start justify-between gap-4">
              <SectionTitle>The answer</SectionTitle>
              {result.fixesTheGoal ? <Badge tone="ok">That fixes it</Badge> : null}
            </div>
            <p aria-live="polite" className="text-lg leading-relaxed text-ink">
              {result.answer}
            </p>
          </Card>

          {result.differences.length > 0 ? (
            <Card>
              <SectionTitle>What moves</SectionTitle>
              <ul className="divide-y divide-line">
                {result.differences.map((d) => (
                  <li key={d.label} className="flex items-baseline justify-between gap-4 py-3">
                    <span className="text-sm text-ink-muted">{d.label}</span>
                    <span className="numeric text-sm">
                      <span className="text-ink-muted line-through">{d.before}</span>
                      <span aria-hidden className="mx-2 text-ink-muted">
                        &rarr;
                      </span>
                      <span className="font-semibold text-ink">{d.after}</span>
                      <span className="sr-only">changes to {d.after}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}

          <Notice tone="default" title="How to read these numbers">
            {set?.assumption}
          </Notice>

          {result.fixesTheGoal ? (
            <div>
              <Button href="/onboarding">Make this my plan</Button>
            </div>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
