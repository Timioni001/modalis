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
import {
  Button,
  Card,
  Failure,
  Loading,
  Notice,
  PageHeader,
  Rows,
  Row,
  SectionTitle,
} from "@/components/ui";
import { PortfolioGate } from "@/components/portfolio-gate";
import { StressTest } from "@/components/stress-test";
import { AffordCheck } from "@/components/afford-check";
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
    <div className="space-y-4">
      <PageHeader
        title="What if?"
        lede="Change one thing and see what it would do to your goal. Nothing here touches your real plan."
      />

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
                  className={`min-h-[46px] rounded-full px-5 text-[14px] font-semibold transition-colors disabled:opacity-60 ${
                    active
                      ? "bg-panel text-panel-ink"
                      : "bg-sunken text-ink-soft hover:bg-line hover:text-ink"
                  }`}
                >
                  {scenario.question}
                </button>
              );
            })}
          </div>
        </Card>
      ) : null}

      <StressTest />
      <AffordCheck />

      {busy && !result ? <Loading label="Working it out" /> : null}

      {result ? (
        <>
          {/* The answer, as a sentence, before any numbers. */}
          <section className="rounded-[28px] bg-panel p-6 text-panel-ink shadow-[var(--shadow-lift)] sm:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-[13px] font-semibold uppercase tracking-[0.09em] text-panel-soft">
                The answer
              </h2>
              {result.fixesTheGoal ? (
                <span className="rounded-full bg-accent px-3 py-1.5 text-xs font-semibold text-accent-ink">
                  That fixes it
                </span>
              ) : null}
            </div>
            <p
              aria-live="polite"
              className="mt-4 text-[20px] leading-relaxed sm:text-[23px]"
            >
              {result.answer}
            </p>
          </section>

          {result.differences.length > 0 ? (
            <Card>
              <SectionTitle>What moves</SectionTitle>
              <Rows>
                {result.differences.map((d) => (
                  <Row key={d.label} className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-ink-muted">{d.label}</span>
                    <span className="numeric text-sm">
                      <span className="text-ink-muted line-through">{d.before}</span>
                      <span aria-hidden className="mx-2 text-ink-muted">
                        &rarr;
                      </span>
                      <span className="font-semibold text-ink">{d.after}</span>
                      <span className="sr-only">changes to {d.after}</span>
                    </span>
                  </Row>
                ))}
              </Rows>
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
