"use client";

/**
 * Live integration status.
 *
 * This component exists to keep the product honest. It reports what the running deployment
 * actually has wired up, so an unconfigured integration appears as unconfigured rather than as a
 * logo. Nothing here is hard-coded to "on".
 */
import { useEffect, useState } from "react";
import { Badge, Card, Notice } from "./ui";
import { shortAddress } from "@/lib/format";

type Status = {
  chainId: number;
  networkName: string;
  rpcReachable: boolean;
  blockNumber?: string | null;
  deployed: boolean;
  contracts?: Record<string, string>;
  integrations?: Record<string, boolean>;
  executionVenue?: { name: string; isDemoVenue: boolean } | null;
  managerConfigured?: boolean;
  demoMode?: boolean;
  error?: string;
};

const LABELS: Record<string, { name: string; role: string }> = {
  monad: { name: "Monad", role: "Portfolio state, mandate enforcement and settlement" },
  dynamic: { name: "Dynamic", role: "Email / social login and the embedded Monad wallet" },
  kuru: { name: "Kuru", role: "Orderbook execution venue for rebalances" },
  chainlinkCre: { name: "Chainlink CRE", role: "DON-signed portfolio risk monitoring" },
  alchemy: { name: "Alchemy", role: "Monad RPC and WebSocket event streams" },
  envio: { name: "Envio", role: "Indexed portfolio and mandate history" },
  ai: { name: "AI layer", role: "Goal interpretation and plain-language explanations" },
};

export function SystemStatus() {
  const [status, setStatus] = useState<Status | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => alive && setStatus(d))
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, []);

  if (failed) {
    return <Notice tone="warn">Could not read deployment status from the server.</Notice>;
  }
  if (!status) {
    return <div className="h-40 animate-pulse rounded-2xl bg-surface-sunken" />;
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Badge tone={status.rpcReachable ? "ok" : "breach"}>
          {status.rpcReachable ? "RPC connected" : "RPC unreachable"}
        </Badge>
        <Badge tone={status.deployed ? "ok" : "warn"}>
          {status.deployed ? "Contracts deployed" : "Contracts not deployed"}
        </Badge>
        <span className="numeric text-sm text-ink-muted">
          {status.networkName} · chain {status.chainId}
          {status.blockNumber ? ` · block ${status.blockNumber}` : ""}
        </span>
      </div>

      {!status.deployed ? (
        <Notice tone="warn" title="No deployment found on this chain">
          Run the deploy script and set the contract addresses, then this page will read them.
        </Notice>
      ) : null}

      <ul className="grid gap-3 sm:grid-cols-2">
        {Object.entries(LABELS).map(([key, meta]) => {
          const on = Boolean(status.integrations?.[key]);
          return (
            <Card as="li" key={key} className="flex items-start justify-between gap-4 p-5">
              <div>
                <div className="font-semibold text-ink">{meta.name}</div>
                <div className="mt-0.5 text-sm text-ink-muted">{meta.role}</div>
              </div>
              <Badge tone={on ? "ok" : "default"}>{on ? "Live" : "Not configured"}</Badge>
            </Card>
          );
        })}
      </ul>

      {status.executionVenue?.isDemoVenue ? (
        <Notice tone="warn" title="Execution runs through the demo adapter">
          Kuru is not configured on this deployment, so trades settle through a demo adapter that
          fills at the oracle price from pre-funded inventory. It is a test fixture, not a venue.
          Set a Kuru router and adapter address to route real orderbook execution.
        </Notice>
      ) : null}

      {status.contracts && status.deployed ? (
        <details className="rounded-xl border border-line p-4 text-sm">
          <summary className="cursor-pointer font-semibold text-ink">
            Deployed contract addresses
          </summary>
          <dl className="mt-3 space-y-2">
            {Object.entries(status.contracts).map(([name, address]) => (
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
