"use client";

/**
 * Wallet, mandate and permissions.
 *
 * The page exists to make authority legible and reversible: the user can see exactly what they
 * have granted, revoke rebalance permission, pause the mandate, or withdraw everything. All three
 * are owner-only on-chain, and the emergency exit keeps working even when the vault is paused.
 */
import { useCallback, useState } from "react";
import { emergencyWithdraw, setMandateActive, setManager } from "@modalis/chain";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, KeyValue, Notice, SectionTitle } from "@/components/ui";
import { ExplorerLink } from "@/components/explorer-link";
import { PortfolioProvider, usePortfolio } from "@/components/portfolio-provider";
import { useWallet } from "@/components/wallet-context";
import { useWalletConfig } from "@/components/wallet-context";
import { pctRound, shortAddress, usd } from "@/lib/format";

export default function SettingsPage() {
  return (
    <PortfolioProvider>
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Settings />
      </div>
    </PortfolioProvider>
  );
}

const ZERO = "0x0000000000000000000000000000000000000000" as Address;

function Settings() {
  const { chainId, networkName } = useWalletConfig();
  const { address, loggedIn, configured, getWalletClient } = useWallet();
  const { portfolio, status, refresh } = usePortfolio();

  const [busy, setBusy] = useState<string | null>(null);
  const [txs, setTxs] = useState<{ label: string; hash: Hex }[]>([]);
  const [error, setError] = useState<string | null>(null);

  const act = useCallback(
    async (label: string, fn: (wallet: Awaited<ReturnType<typeof getWalletClient>>, dep: { chainId: number; contracts: Record<string, Address>; tokens: Record<string, Address> }) => Promise<Hex>) => {
      setBusy(label);
      setError(null);
      try {
        const wallet = await getWalletClient();
        const s = await fetch("/api/status").then((r) => r.json());
        if (!s.contracts?.portfolioVault) throw new Error("Modalis is not deployed on this chain.");
        const hash = await fn(wallet, { chainId, contracts: s.contracts, tokens: s.tokens ?? {} });
        setTxs((t) => [...t, { label, hash }]);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : `Could not ${label.toLowerCase()}.`);
      } finally {
        setBusy(null);
      }
    },
    [getWalletClient, chainId, refresh],
  );

  const state = portfolio?.state;
  const managerAuthorised = portfolio?.manager && portfolio.manager !== ZERO;

  return (
    <div className="space-y-6">
      <h1 className="text-3xl font-semibold tracking-tight text-ink">Settings</h1>

      {/* --------------------------------------------------------- the wallet */}
      <Card>
        <SectionTitle>Wallet</SectionTitle>
        <dl>
          <KeyValue label="Network">
            {networkName} (chain {chainId})
          </KeyValue>
          <KeyValue label="Signed in">{loggedIn ? "Yes" : "No"}</KeyValue>
          <KeyValue label="Address">{address ? shortAddress(address) : "—"}</KeyValue>
          <KeyValue label="Wallet onboarding">{configured ? "Dynamic" : "Not configured"}</KeyValue>
        </dl>
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Your wallet is yours. Dynamic creates and secures it; Modalis never holds your keys, and
          the portfolio contracts recognise only this address as the owner of your funds.
        </p>
      </Card>

      {/* -------------------------------------------------------- permissions */}
      <Card>
        <SectionTitle hint="What you have granted, and how to take it back.">Permissions</SectionTitle>
        <dl>
          <KeyValue label="Rebalance proposals">
            {managerAuthorised ? shortAddress(portfolio!.manager!) : "Not authorised"}
          </KeyValue>
          <KeyValue label="That key can withdraw">No</KeyValue>
          <KeyValue label="That key can change your rules">No</KeyValue>
          <KeyValue label="Mandate status">{state?.mandate.active ? "Active" : "Paused"}</KeyValue>
        </dl>

        <div className="mt-5 flex flex-wrap gap-3">
          {managerAuthorised ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() => act("Revoke rebalance permission", (w, d) => setManager(w, d, ZERO))}
            >
              {busy === "Revoke rebalance permission" ? "Revoking…" : "Revoke rebalance permission"}
            </Button>
          ) : status?.managerAddress ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() =>
                act("Authorise rebalance proposals", (w, d) =>
                  setManager(w, d, status.managerAddress as Address),
                )
              }
            >
              {busy === "Authorise rebalance proposals" ? "Authorising…" : "Authorise rebalance proposals"}
            </Button>
          ) : null}

          {state ? (
            <Button
              variant="secondary"
              disabled={busy !== null || !loggedIn}
              onClick={() =>
                act(state.mandate.active ? "Pause mandate" : "Resume mandate", (w, d) =>
                  setMandateActive(w, d, !state.mandate.active),
                )
              }
            >
              {state.mandate.active ? "Pause my mandate" : "Resume my mandate"}
            </Button>
          ) : null}
        </div>

        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          Pausing your mandate stops all rebalancing. Withdrawals keep working while paused, by
          design &mdash; a pause must never trap your money.
        </p>
      </Card>

      {/* ------------------------------------------------------- your mandate */}
      {state ? (
        <Card>
          <SectionTitle hint={`Version ${state.mandate.version}.`}>Your mandate</SectionTitle>
          <dl>
            <KeyValue label="Goal">{usd(BigInt(state.mandate.targetValue), { decimals: 0 })}</KeyValue>
            <KeyValue label="Maximum drawdown">{pctRound(state.mandate.maxDrawdownBps)}</KeyValue>
            <KeyValue label="Liquidity reserve">{pctRound(state.mandate.minLiquidityBps)}</KeyValue>
            <KeyValue label="Maximum single asset">{pctRound(state.mandate.maxSingleAssetBps)}</KeyValue>
            <KeyValue label="Rebalance threshold">{pctRound(state.mandate.rebalanceThresholdBps)}</KeyValue>
          </dl>
          <div className="mt-5">
            <Button variant="secondary" href="/onboarding">
              Change my mandate
            </Button>
          </div>
          <p className="mt-4 text-xs leading-relaxed text-ink-muted">
            Changing your mandate creates a new version on-chain. Any rebalance proposal built
            against the old version is automatically invalid, so nothing stale can execute.
          </p>
        </Card>
      ) : null}

      {/* ----------------------------------------------------------- the exit */}
      <Card className="border-breach/30">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle hint="Returns every asset you hold to your wallet, in one transaction.">
            Withdraw everything
          </SectionTitle>
          <Badge tone="breach">Owner only</Badge>
        </div>
        <Button
          variant="danger"
          disabled={busy !== null || !loggedIn}
          onClick={() => act("Withdraw everything", (w, d) => emergencyWithdraw(w, d))}
        >
          {busy === "Withdraw everything" ? "Withdrawing…" : "Withdraw everything"}
        </Button>
        <p className="mt-4 text-xs leading-relaxed text-ink-muted">
          This works even if the vault is paused, and no one but you can call it. It is the reason
          handing Modalis a mandate is not the same as handing over your money.
        </p>
      </Card>

      {error ? <Notice tone="breach">{error}</Notice> : null}
      {txs.length > 0 ? (
        <Notice tone="ok" title="Settled on Monad">
          <ul className="space-y-1">
            {txs.map((t) => (
              <li key={t.hash}>
                {t.label}: <ExplorerLink hash={t.hash} />
              </li>
            ))}
          </ul>
        </Notice>
      ) : null}
    </div>
  );
}
