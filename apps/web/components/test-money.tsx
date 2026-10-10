"use client";

/**
 * "Get test money", and help with network fees, for a wallet that has nothing yet.
 *
 * Shown only on the test network, and only while it is needed: a wallet with demo dollars and
 * enough MON for fees sees nothing here. Two routes (see packages/chain/src/faucet.ts):
 *
 *  - When Modalis pays, one tap and the server sends demo tokens plus a little MON. The person
 *    signs nothing.
 *  - Otherwise the person's own wallet mints all four demo tokens in one transaction, which needs
 *    a little MON. With none, the card says where to get it rather than letting a signature fail.
 */
import { useCallback, useEffect, useState } from "react";
import { mintTestMoney, isOutOfGasFundsError } from "@modalis/chain";
import type { Address } from "viem";
import { Button, Card, Notice, SectionTitle } from "@/components/ui";
import { usePortfolio } from "@/components/portfolio-provider";
import { ReceiptLink } from "@/components/receipt-link";
import { useWallet } from "@/components/wallet-context";
import { apiGet, apiPost } from "@/lib/client-api";
import { confirmOnChain } from "@/lib/chain-client";
import { ConfirmedIn } from "@/components/confirmed-in";
import { Explain } from "@/components/explain";

type FaucetState = {
  testnet: boolean;
  lowGas: boolean;
  hasTestMoney: boolean;
  modalisPays: boolean;
  faucetUrl: string;
};

export function TestMoney({ onFunded }: { onFunded?: () => void | Promise<void> }) {
  const { loggedIn, address, chainId, rpcUrl, getWalletClient } = useWallet();
  const { status } = usePortfolio();
  const [state, setState] = useState<FaucetState | null>(null);
  const [working, setWorking] = useState(false);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [ms, setMs] = useState<number | null>(null);

  const check = useCallback(async () => {
    if (!loggedIn) return;
    setChecking(true);
    try {
      setState(await apiGet<FaucetState>("/api/faucet"));
    } catch {
      // Not worth a visible error: without an answer the card simply stays hidden.
    } finally {
      setChecking(false);
    }
  }, [loggedIn]);

  useEffect(() => {
    void check();
  }, [check]);

  const get = useCallback(async () => {
    if (!state) return;
    setError(null);
    setWorking(true);
    try {
      if (state.modalisPays) {
        const sent = await apiPost<{ mintReceipt: string | null; gasReceipt: string | null }>(
          "/api/faucet",
        );
        setReceipt(sent.mintReceipt ?? sent.gasReceipt);
      } else {
        const wallet = await getWalletClient();
        const deployment = {
          chainId,
          contracts: (status?.technical?.contracts ?? {}) as Record<string, Address>,
          tokens: (status?.technical?.tokens ?? {}) as Record<string, Address>,
        };
        const hash = await mintTestMoney(wallet, deployment);
        setMs((await confirmOnChain(hash, { chainId, rpcUrl })).ms);
        setReceipt(hash);
      }
      await check();
      await onFunded?.();
    } catch (err) {
      if (isOutOfGasFundsError(err)) {
        setState((s) => (s ? { ...s, lowGas: true } : s));
        setError("Your wallet needs a little MON to pay the network fee first. See below.");
      } else {
        setError(err instanceof Error ? err.message : "That didn't go through. Nothing was charged.");
      }
    } finally {
      setWorking(false);
    }
  }, [state, getWalletClient, chainId, rpcUrl, status, check, onFunded]);

  if (!loggedIn || !state || !state.testnet) return null;
  if (state.hasTestMoney && !state.lowGas && !receipt) return null;

  const needsMon = state.lowGas && !state.modalisPays;
  const canGet = !state.hasTestMoney || (state.lowGas && state.modalisPays);

  return (
    <Card>
      <SectionTitle hint="Demo dollars on the test network. They are worth nothing.">
        {state.hasTestMoney && !receipt ? "Network fees" : "Get test money"}
      </SectionTitle>

      {receipt && state.hasTestMoney ? (
        <Notice tone="ok" title="Done">
          Your wallet has test money and MON for fees. <ReceiptLink reference={receipt} />{" "}
          <ConfirmedIn ms={ms} />
        </Notice>
      ) : null}

      {canGet && !receipt ? (
        <>
          <p className="text-sm leading-relaxed text-ink-soft">
            {state.modalisPays
              ? "One tap and Modalis sends demo dollars, plus a little MON for network fees, to your wallet. You don't sign anything."
              : "One tap mints demo dollars to your wallet in a single transaction, so you can try adding money to your plan."}
          </p>
          <div className="mt-4">
            <Button onClick={get} busy={working} busyLabel="Sending…" disabled={working || needsMon}>
              Get test money
            </Button>
          </div>
        </>
      ) : null}

      {error ? (
        <div className="mt-4">
          <Notice tone="breach">{error}</Notice>
        </div>
      ) : null}

      {needsMon ? (
        <div className="mt-4">
          <Notice tone="warn" title="You need a little MON for network fees">
            <p>
              <Explain term="fee" />{" "}
              Every action on Monad costs a tiny fee in MON, and your wallet has almost none. Test
              MON is free: open the{" "}
              <a href={state.faucetUrl} target="_blank" rel="noreferrer">
                Monad faucet
              </a>{" "}
              and paste your wallet address.
            </p>
            {address ? (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <code className="numeric break-all rounded-lg bg-surface px-2 py-1 text-xs text-ink">
                  {address}
                </code>
                <button
                  type="button"
                  className="text-xs font-semibold text-ink underline underline-offset-2"
                  onClick={() => {
                    void navigator.clipboard?.writeText(address).then(() => setCopied(true));
                  }}
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            ) : null}
            <div className="mt-3">
              <Button variant="secondary" onClick={check} busy={checking} busyLabel="Checking…">
                I&rsquo;ve got MON, check again
              </Button>
            </div>
          </Notice>
        </div>
      ) : null}
    </Card>
  );
}

/** Shown in place of a raw wallet error when a transaction can't pay its fee. */
export function gasHelpMessage(err: unknown): string | null {
  return isOutOfGasFundsError(err)
    ? "Your wallet doesn't have enough MON to pay the network fee. Test MON is free at faucet.monad.xyz; paste your wallet address there, then try again."
    : null;
}
