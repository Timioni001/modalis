"use client";

import { useCallback, useEffect, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Badge, Button, Card, Notice, Skeleton } from "./ui";
import { apiGet } from "@/lib/client-api";
import type { SystemStatus as Status } from "@/lib/api-types";
import { ReceiptLink } from "./receipt-link";

const SERVICES = [
  ["settlement", "Monad", "Contract settlement"],
  ["signIn", "Dynamic", "Consumer wallet onboarding"],
  ["savedData", "Supabase", "Saved goals and preferences"],
  ["history", "Envio", "Indexed receipt history"],
  ["agentWallet", "Dynamic server wallet", "Restricted adjustment signing"],
  ["trading", "Kuru", "Orderbook execution"],
  ["independentMonitoring", "Chainlink CRE", "Independent risk reports"],
  ["network", "Alchemy", "Optional RPC transport"],
  ["explanations", "AI", "Optional goal interpretation"],
] as const;

export function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async (signal?: AbortSignal) => {
    setBusy(true);
    setError(false);
    try {
      const next = await apiGet<Status>(
        signal ? "/api/status" : "/api/status?fresh=1",
        signal,
      );
      if (!signal?.aborted) setStatus(next);
    } catch {
      if (!signal?.aborted) setError(true);
    } finally {
      if (!signal?.aborted) setBusy(false);
    }
  }, []);
  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);
  if (!status && !error) return <Skeleton className="h-64" />;
  if (!status)
    return (
      <Notice
        tone="warn"
        title="Status checks are unavailable"
        action={<Button onClick={() => void load()}>Try again</Button>}
      >
        The network or a service may be slow. No saved financial figures are
        being used as live data.
      </Notice>
    );
  const readiness =
    status.readiness ??
    (!status.ready
      ? "offline"
      : status.prices?.ready === false
        ? "limited"
        : "ready");
  const capabilities = [
    {
      title: "Create a saving plan",
      ready: status.capabilities.canCreatePlan,
      detail: "Set your goal, contribution and personal limits.",
    },
    {
      title: "Send and request payments",
      ready: status.features?.payments ?? status.ready,
      detail: "Review a recipient and approve each testnet transfer yourself.",
    },
    {
      title: "Save demo dollars",
      ready: status.features?.directSaving ?? status.capabilities.canFund,
      detail:
        "Save exact mUSD quantities to your own plan, without waiting for a portfolio quote.",
    },
    {
      title: "Read saved goals",
      ready: status.features?.savedGoals ?? status.poweredBy?.savedData,
      detail: "Goal details remain accessible without a portfolio valuation.",
    },
  ];
  return (
    <div className="space-y-6">
      <motion.section
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-[28px] bg-panel p-6 text-panel-ink shadow-[var(--shadow-lift)] sm:p-8"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span
              className={`h-2.5 w-2.5 rounded-full ${readiness === "ready" ? "bg-accent" : readiness === "limited" ? "bg-warn" : "bg-breach"}`}
            />
            <span className="text-sm font-medium">
              {readiness === "ready"
                ? "Consumer demo available"
                : readiness === "limited"
                  ? "Consumer demo has limited availability"
                  : "Network connection unavailable"}
            </span>
          </div>
          <Button variant="secondary" busy={busy} onClick={() => void load()}>
            Check again
          </Button>
        </div>
        <h2 className="mt-5 text-2xl font-semibold tracking-tight sm:text-3xl">
          A clear view of what works.
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-panel-soft">
          Consumer Products &amp; Payments is the primary track. Each capability
          below is checked separately, so one unavailable service does not hide
          the rest of the product.
        </p>
        <div className="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-panel-soft">
          <span>
            {status.network.name} ·{" "}
            {status.network.reachable ? "Connected" : "Offline"}
          </span>
          <span>
            {status.network.blockNumber
              ? `Block ${status.network.blockNumber}`
              : "No block read"}
          </span>
          <span>
            {status.checkedAt
              ? `Checked ${new Date(status.checkedAt).toLocaleTimeString()}`
              : "Checked on this page load"}
          </span>
        </div>
      </motion.section>
      <AnimatePresence>
        {error ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <Notice tone="warn">
              The last refresh failed. The checks shown below are from the
              displayed check time.
            </Notice>
          </motion.div>
        ) : null}
      </AnimatePresence>
      <div className="grid gap-3 sm:grid-cols-2">
        {capabilities.map((capability, index) => (
          <motion.div
            key={capability.title}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.035 }}
          >
            <Card className="h-full border border-line/60 shadow-none">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <h3 className="max-w-[220px] font-semibold">
                  {capability.title}
                </h3>
                <Badge tone={capability.ready ? "ok" : "warn"}>
                  {capability.ready ? "Available" : "Needs attention"}
                </Badge>
              </div>
              <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                {capability.detail}
              </p>
            </Card>
          </motion.div>
        ))}
      </div>
      {status.prices?.ready === false ? (
        <Card className="border border-warn/20 shadow-none">
          <h3 className="font-semibold">Portfolio prices need recovery</h3>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            Expired quotes pause dollar valuations, allocation funding and
            trades. Saving or retrieving exact mUSD quantities, payment
            requests, token transfers, saved plans and manual calculations
            remain available.
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button href="/app/add-money" variant="secondary">
              Save demo dollars
            </Button>
            <Button href="/app/plan" variant="quiet">
              Open pricing recovery
            </Button>
          </div>
        </Card>
      ) : null}
      <details className="rounded-3xl border border-line bg-surface p-5 shadow-[var(--shadow-card)]">
        <summary className="min-h-11 cursor-pointer font-semibold">
          Sponsor integrations and evidence
        </summary>
        <p className="my-4 text-sm leading-relaxed text-ink-muted">
          These services support the secondary Onchain Finance &amp; Trading
          story and sponsor bounties. A configured endpoint or contract is not a
          completed integration; a confirmed market fill, running workflow or
          actual service response is required.
        </p>
        <ul className="divide-y divide-line">
          {SERVICES.map(([key, provider, purpose]) => {
            const health = status.integrations?.[key];
            return (
              <li key={key} className="py-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold">{provider}</h3>
                    <p className="mt-1 text-xs text-ink-muted">{purpose}</p>
                  </div>
                  <Badge
                    tone={
                      health?.state === "healthy"
                        ? "ok"
                        : health?.state === "attention"
                          ? "warn"
                          : "default"
                    }
                  >
                    {health?.label ?? "Not verified"}
                  </Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {health?.detail ??
                    "No successful service check is available."}
                </p>
              </li>
            );
          })}
        </ul>
      </details>
      {status.signIn?.developmentBypassEnabled ? (
        <Notice tone="warn">
          This local test deployment uses development sign-in. It is refused in
          production and is not Dynamic integration evidence.
        </Notice>
      ) : null}
      {status.technical ? (
        <details className="rounded-3xl border border-line bg-surface p-5">
          <summary className="min-h-11 cursor-pointer font-semibold">
            Verify contract addresses
          </summary>
          <dl className="space-y-3">
            {Object.entries(status.technical.contracts).map(
              ([name, address]) => (
                <div
                  key={name}
                  className="flex flex-wrap items-center justify-between gap-2"
                >
                  <dt className="break-words text-sm text-ink-muted">{name}</dt>
                  <dd className="text-xs">
                    <ReceiptLink address={address} />
                  </dd>
                </div>
              ),
            )}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
