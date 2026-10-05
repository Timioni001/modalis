"use client";

/**
 * What this deployment can actually do.
 *
 * The component exists to keep the product honest. It reports what is really wired up, so
 * something unconfigured appears as unconfigured rather than as a logo. Nothing here is
 * hard-coded to "on".
 *
 * Each row leads with what the capability does for the person; the technology that provides it is
 * named underneath, because that is the honest ordering — a person cares that their money settles
 * and that something independent is watching it, not which vendor does either.
 */
import { useEffect, useState } from "react";
import { Badge, Card, Notice } from "./ui";
import { shortAddress } from "@/lib/format";
import type { SystemStatus as Status } from "@/lib/api-types";

/** `poweredBy` key -> what it does for the person, and who provides it. */
const CAPABILITIES: { key: keyof NonNullable<Status["poweredBy"]>; does: string; by: string }[] = [
  { key: "settlement", does: "Your money and your limits are held where Modalis can't rewrite them", by: "Monad" },
  { key: "signIn", does: "Sign in with an email address and get an account only you control", by: "Dynamic" },
  { key: "trading", does: "Adjustments are carried out at a real market price", by: "Kuru" },
  { key: "independentMonitoring", does: "Something independent of Modalis watches your plan", by: "Chainlink CRE" },
  { key: "history", does: "Your full history, with a receipt for every action", by: "Envio" },
  { key: "network", does: "Live balances and prices", by: "Alchemy" },
  { key: "explanations", does: "Your goal read in your own words, and plain-language explanations", by: "AI" },
  { key: "savedData", does: "Your goal and the adjustments your rules refused are kept", by: "Supabase" },
];

export function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => alive && setStatus(d as Status))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return <Notice tone="warn">We couldn&apos;t read this deployment&apos;s status.</Notice>;
  }
  if (!status) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  const network = status.network;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={network.reachable ? "ok" : "breach"}>
          {network.reachable ? "Connected" : "Not reachable"}
        </Badge>
        <Badge tone={status.ready ? "ok" : "warn"}>
          {status.ready ? "Ready to use" : "Not set up on this network"}
        </Badge>
        <span className="numeric text-sm text-ink-muted">
          {network.name} · {network.chainId}
          {network.blockNumber ? ` · block ${network.blockNumber}` : ""}
        </span>
      </div>

      {status.capabilities.limitations.length > 0 ? (
        <Notice tone="warn" title="What this deployment can't do yet">
          <ul className="space-y-1">
            {status.capabilities.limitations.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Notice>
      ) : null}

      {status.signIn?.developmentBypassEnabled ? (
        <Notice tone="breach" title="Development sign-in is switched on">
          This deployment accepts a development account header instead of a real sign-in. It is
          refused outright on the live network, but it should never be left on anywhere else.
        </Notice>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {CAPABILITIES.map((capability) => {
          const on = Boolean(status.poweredBy?.[capability.key]);
          return (
            <Card as="li" key={capability.key} className="flex items-start justify-between gap-4 p-5">
              <div>
                <div className="font-medium text-ink">{capability.does}</div>
                <div className="mt-0.5 text-sm text-ink-muted">{capability.by}</div>
              </div>
              <Badge tone={on ? "ok" : "default"}>{on ? "Live" : "Not set up"}</Badge>
            </Card>
          );
        })}
      </ul>

      {status.trading && !status.trading.live ? (
        <Notice tone="warn" title="Adjustments don't go to a real market here">
          {status.trading.note}
        </Notice>
      ) : null}

      {status.ready && status.technical?.contracts ? (
        <details className="rounded-xl border border-line p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">
            For anyone who wants to check: the addresses holding your limits
          </summary>
          <dl className="mt-3 space-y-2">
            {Object.entries(status.technical.contracts).map(([name, address]) => (
              <div key={name} className="flex items-center justify-between gap-4">
                <dt className="text-ink-muted">{name}</dt>
                <dd className="numeric text-ink" title={address}>
                  {shortAddress(address)}
                </dd>
              </div>
            ))}
          </dl>
        </details>
      ) : null}
    </div>
  );
}
