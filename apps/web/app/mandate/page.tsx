"use client";

/**
 * The mandate approval screen.
 *
 * This is the most important screen in the product. It is where the user sees that they are not
 * handing an AI unlimited authority: they are approving a specific, bounded policy, and the
 * contract will refuse anything outside it.
 *
 * Approving signs setMandate from the USER's own wallet. The server never signs this — only the
 * owner can set their own mandate, which PortfolioMandate enforces by keying off msg.sender.
 */
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { setManager as setManagerOnChain, setMandate } from "@modalis/chain";
import type { MandateDraft } from "@modalis/ai";
import type { Address, Hex } from "viem";
import { Badge, Button, Card, KeyValue, Notice, SectionTitle, Stat } from "@/components/ui";
import { useWallet } from "@/components/wallet-context";
import { useWalletConfig } from "@/components/wallet-context";
import { loadAnswers } from "@/lib/interview-store";
import { monthsToHuman, pct, pctRound, targetDateLabel, usd } from "@/lib/format";
import { ExplorerLink } from "@/components/explorer-link";

type DraftResponse = {
  draft: MandateDraft;
  explanation: string;
  goalRestatement?: string;
};

/**
 * Rehydrates the bigint fields the API serialised as strings.
 *
 * The response is typed as MandateDraft for convenience, but over the wire targetValue and
 * targetDate are decimal strings, so they are read through `unknown` and converted with BigInt —
 * never with Number, which would lose precision on a 1e18-scaled amount.
 */
function reviveDraft(raw: DraftResponse): DraftResponse {
  const wire = raw.draft.params as unknown as Record<string, string>;
  return {
    ...raw,
    draft: {
      ...raw.draft,
      params: {
        ...raw.draft.params,
        targetValue: BigInt(wire.targetValue),
        targetDate: BigInt(wire.targetDate),
      },
    },
  };
}

export default function MandatePage() {
  const router = useRouter();
  const { configured, chainId } = useWalletConfig();
  const { loggedIn, address, getWalletClient } = useWallet();

  const [data, setData] = useState<DraftResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "signing" | "done">("idle");
  const [txs, setTxs] = useState<{ label: string; hash: Hex }[]>([]);
  const [deployment, setDeployment] = useState<{ contracts: Record<string, string>; managerAddress?: string } | null>(null);

  // --- Build the mandate from the stored interview answers.
  useEffect(() => {
    const answers = loadAnswers();
    if (!answers) {
      router.replace("/onboarding");
      return;
    }
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/mandate/draft", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(answers),
        });
        const json = await res.json();
        if (!alive) return;
        if (!res.ok) {
          setError(json.error ?? "Could not build a mandate from those answers.");
          return;
        }
        setData(reviveDraft(json as DraftResponse));
      } catch {
        if (alive) setError("Could not reach the Modalis server.");
      }
    })();
    return () => {
      alive = false;
    };
  }, [router]);

  useEffect(() => {
    fetch("/api/status")
      .then((r) => r.json())
      .then((d) => setDeployment({ contracts: d.contracts ?? {}, managerAddress: d.managerAddress }))
      .catch(() => setDeployment(null));
  }, []);

  const approve = useCallback(async () => {
    if (!data) return;
    setError(null);
    setStatus("signing");
    try {
      const wallet = await getWalletClient();
      const statusRes = await fetch("/api/status").then((r) => r.json());
      const contracts = statusRes.contracts as Record<string, Address> | undefined;
      if (!contracts?.portfolioMandate) throw new Error("Modalis is not deployed on this chain.");

      const dep = { chainId, contracts, tokens: statusRes.tokens ?? {} };
      const allocations = data.draft.allocations.map((a) => ({
        token: a.token as Address,
        targetBps: a.targetBps,
        minBps: a.minBps,
        maxBps: a.maxBps,
      }));

      const mandateHash = await setMandate(wallet, dep, data.draft.params, allocations);
      setTxs((t) => [...t, { label: "Mandate approved", hash: mandateHash }]);

      // Authorise the Modalis manager to PROPOSE rebalances. This grants no withdrawal or
      // mandate authority; the contract refuses both for anyone but the owner.
      if (statusRes.managerAddress) {
        const managerHash = await setManagerOnChain(wallet, dep, statusRes.managerAddress as Address);
        setTxs((t) => [...t, { label: "Rebalance proposals authorised", hash: managerHash }]);
      }

      setStatus("done");
    } catch (err) {
      setStatus("idle");
      setError(err instanceof Error ? err.message : "Could not approve the mandate.");
    }
  }, [data, getWalletClient, chainId]);

  if (error && !data) {
    return (
      <div className="mx-auto max-w-2xl px-5 py-16">
        <Notice tone="breach" title="Could not build your mandate">
          {error}
        </Notice>
        <div className="mt-6">
          <Button variant="secondary" onClick={() => router.push("/onboarding")}>
            Back to the interview
          </Button>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-3xl px-5 py-16">
        <div className="h-8 w-56 animate-pulse rounded bg-surface-sunken" />
        <div className="mt-6 h-64 animate-pulse rounded-2xl bg-surface-sunken" />
      </div>
    );
  }

  const { draft } = data;
  const p = draft.params;

  return (
    <div className="mx-auto max-w-3xl px-5 py-14">
      <Badge tone="accent">Your portfolio mandate</Badge>
      <h1 className="mt-5 text-4xl font-semibold tracking-tight text-ink">
        This is the policy Modalis will use to manage your portfolio.
      </h1>

      {data.goalRestatement ? (
        <div className="mt-6">
          <Notice tone="accent" title="What Modalis understood">
            {data.goalRestatement}
          </Notice>
        </div>
      ) : null}

      {/* ---------------------------------------------------------- the goal */}
      <Card className="mt-8">
        <div className="grid gap-8 sm:grid-cols-3">
          <Stat label="Goal" value={usd(p.targetValue, { decimals: 0 })} size="lg" />
          <Stat label="Target date" value={targetDateLabel(Number(p.targetDate))} size="md" sub={monthsToHuman(draft.goal.horizonMonths)} />
          <Stat
            label="Contribution"
            value={`$${draft.monthlyContributionUsd.toLocaleString("en-US", { maximumFractionDigits: 0 })}`}
            size="md"
            sub="per month"
          />
        </div>
      </Card>

      {/* ---------------------------------------------------------- the rules */}
      <Card className="mt-5">
        <SectionTitle hint="Modalis can only act inside these limits. The contract rejects anything else.">
          The rules you are approving
        </SectionTitle>
        <dl>
          <KeyValue label="Maximum drawdown">{pctRound(p.maxDrawdownBps)}</KeyValue>
          <KeyValue label="Liquidity reserve (minimum)">{pctRound(p.minLiquidityBps)}</KeyValue>
          <KeyValue label="Maximum in any single asset">{pctRound(p.maxSingleAssetBps)}</KeyValue>
          <KeyValue label="Rebalance threshold">{pctRound(p.rebalanceThresholdBps)}</KeyValue>
          <KeyValue label="Maximum trade slippage">{pct(p.maxSlippageBps)}</KeyValue>
        </dl>
      </Card>

      {/* ----------------------------------------------------- the allocation */}
      <Card className="mt-5">
        <SectionTitle hint="Each holding has a target and a range it must stay inside.">
          Your starting allocation
        </SectionTitle>
        <ul className="divide-y divide-line">
          {draft.allocations.map((a) => (
            <li key={a.token} className="flex items-center justify-between gap-4 py-3">
              <div>
                <span className="font-semibold text-ink">{a.symbol}</span>
                {a.isLiquid ? (
                  <span className="ml-2 text-xs text-ink-muted">counts as your cash reserve</span>
                ) : null}
              </div>
              <div className="text-right">
                <div className="numeric font-semibold text-ink">{pctRound(a.targetBps)}</div>
                <div className="numeric text-xs text-ink-muted">
                  may range {pct(a.minBps, 0)}–{pct(a.maxBps, 0)}
                </div>
              </div>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------- the reasoning */}
      <Card className="mt-5 bg-surface-sunken">
        <SectionTitle>Why these numbers</SectionTitle>
        <ul className="space-y-2 text-sm text-ink-soft">
          {[...draft.profile.rationale, ...draft.plan.rationale].map((line) => (
            <li key={line} className="flex gap-2">
              <span aria-hidden className="text-ink-muted">
                ·
              </span>
              <span>{line}</span>
            </li>
          ))}
        </ul>
      </Card>

      {/* ------------------------------------------------------------ approve */}
      <div className="mt-8 space-y-4">
        {status === "done" ? (
          <Notice tone="ok" title="Your mandate is live on Monad">
            <div className="space-y-2">
              <p>Your portfolio policy is now stored onchain. Next: fund the portfolio.</p>
              <ul className="space-y-1">
                {txs.map((t) => (
                  <li key={t.hash}>
                    {t.label}: <ExplorerLink hash={t.hash} />
                  </li>
                ))}
              </ul>
            </div>
          </Notice>
        ) : null}

        {error ? <Notice tone="breach">{error}</Notice> : null}

        {!configured ? (
          <Notice tone="warn" title="Wallet onboarding is not configured">
            Set <code>NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID</code> to enable email sign-in and the
            embedded Monad wallet. Your mandate is ready; approving it needs a wallet to sign with.
          </Notice>
        ) : !loggedIn ? (
          <Notice tone="accent" title="Sign in to approve">
            Use <strong>Continue with email</strong> at the top of the page. Modalis will create a
            Monad wallet you own.
          </Notice>
        ) : null}

        <div className="flex flex-wrap items-center gap-3">
          {status === "done" ? (
            <Button onClick={() => router.push("/portfolio")}>Go to my portfolio</Button>
          ) : (
            <Button onClick={approve} disabled={!loggedIn || status === "signing"}>
              {status === "signing" ? "Waiting for your signature…" : "Approve mandate"}
            </Button>
          )}
          <Button variant="secondary" onClick={() => router.push("/onboarding")}>
            Edit my answers
          </Button>
        </div>

        {address ? (
          <p className="text-xs text-ink-muted">
            Signing as {address}. Only this address can change this mandate or withdraw these funds.
          </p>
        ) : null}
      </div>
    </div>
  );
}
