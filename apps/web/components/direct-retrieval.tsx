"use client";
import { useEffect, useRef, useState } from "react";
import { withdraw } from "@modalis/chain";
import type { Address, Hex } from "viem";
import { Button, Card, Field, Notice, SectionTitle, TextField } from "./ui";
import { ReceiptLink } from "./receipt-link";
import { useWallet, useWalletConfig } from "./wallet-context";
import { usePortfolio } from "./portfolio-provider";
import { apiPost } from "@/lib/client-api";
import { confirmOnChain } from "@/lib/chain-client";
import { walletActionMessage } from "@/lib/wallet-error";

type Review = {
  token: Address;
  vault: Address;
  units: string;
  rawUnits: string;
  reminderAt: string | null;
};
export function DirectRetrieval({ onStart }: { onStart: () => void }) {
  const { getWalletClient, address } = useWallet();
  const { chainId, rpcUrl } = useWalletConfig();
  const { refresh, status } = usePortfolio();
  const [amount, setAmount] = useState("1");
  const [review, setReview] = useState<Review | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receipt, setReceipt] = useState<Hex | null>(null);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, [address]);
  async function prepare() {
    onStart();
    setBusy(true);
    setError(null);
    try {
      const next = await apiPost<Review>("/api/money/direct-retrieval", {
        amount,
      });
      if (alive.current) setReview(next);
    } catch (problem) {
      if (alive.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "The retrieval could not be prepared.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function takeOut() {
    if (!review || chainId !== 10143) return;
    setBusy(true);
    setError(null);
    try {
      if (
        review.token.toLowerCase() !==
          status?.technical?.tokens.mUSD?.toLowerCase() ||
        review.vault.toLowerCase() !==
          status.technical.contracts.portfolioVault?.toLowerCase()
      )
        throw new Error(
          "This review doesn't match your deployment. Prepare it again.",
        );
      const wallet = await getWalletClient();
      if (!alive.current) return;
      const hash = await withdraw(
        wallet,
        {
          chainId,
          contracts: { portfolioVault: review.vault },
          tokens: { mUSD: review.token },
        },
        review.token,
        BigInt(review.rawUnits),
      );
      await confirmOnChain(hash, { chainId, rpcUrl });
      if (alive.current) setReceipt(hash);
      await apiPost("/api/money/confirm", {
        receipt: hash,
        kind: "withdraw",
      }).catch(() => undefined);
      await refresh();
    } catch (problem) {
      if (alive.current)
        setError(walletActionMessage(problem, "The retrieval could not finish."));
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  return (
    <Card>
      <SectionTitle hint="Withdraw exact demo-dollar quantities. The effect on your goal's dollar value needs fresh portfolio pricing.">
        Retrieve mUSD directly
      </SectionTitle>
      <Field htmlFor="direct-retrieve-amount" label="Amount in mUSD">
        <TextField
          id="direct-retrieve-amount"
          value={amount}
          inputMode="decimal"
          disabled={busy}
          onChange={(event) => {
            setAmount(event.target.value);
            setReview(null);
            setReceipt(null);
          }}
        />
      </Field>
      {!review ? (
        <Button className="mt-4" onClick={prepare} busy={busy}>
          Review retrieval
        </Button>
      ) : (
        <div className="mt-4 rounded-2xl bg-sunken p-4">
          <h3 className="font-semibold">
            Retrieve {review.units} mUSD to your account
          </h3>
          {review.reminderAt && Date.parse(review.reminderAt) > Date.now() ? (
            <p className="mt-3 text-sm text-ink-soft">
              Your personal retrieval reminder is{" "}
              {new Date(review.reminderAt).toLocaleDateString()}. You can
              withdraw early; this setting does not lock your tokens.
            </p>
          ) : null}
          {receipt ? (
            <Notice tone="ok" title="Your demo dollars were retrieved">
              <ReceiptLink reference={receipt} />
            </Notice>
          ) : (
            <Button className="mt-4" onClick={takeOut} busy={busy}>
              Retrieve {review.units} mUSD
            </Button>
          )}
        </div>
      )}
      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
