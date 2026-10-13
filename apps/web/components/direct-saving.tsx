"use client";
import { useEffect, useRef, useState } from "react";
import { approveToken, deposit } from "@modalis/chain";
import type { Address, Hex } from "viem";
import { motion } from "motion/react";
import { Button, Card, Field, Notice, SectionTitle, TextField } from "./ui";
import { useWallet, useWalletConfig } from "./wallet-context";
import { usePortfolio } from "./portfolio-provider";
import { apiPost } from "@/lib/client-api";
import { confirmOnChain } from "@/lib/chain-client";
import { ReceiptLink } from "./receipt-link";
import { walletActionMessage } from "@/lib/wallet-error";

type Prepared = {
  token: Address;
  vault: Address;
  units: string;
  rawUnits: string;
  needsApproval: boolean;
  canCover: boolean;
};
export function DirectSaving({ onStart }: { onStart: () => void }) {
  const { address, getWalletClient } = useWallet();
  const { chainId, rpcUrl } = useWalletConfig();
  const { status, refresh } = usePortfolio();
  const [amount, setAmount] = useState("10");
  const [prepared, setPrepared] = useState<Prepared | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
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
    setReceipt(null);
    try {
      const next = await apiPost<Prepared>("/api/money/direct-saving", {
        amount,
      });
      if (alive.current) setPrepared(next);
    } catch (problem) {
      if (alive.current)
        setError(
          problem instanceof Error
            ? problem.message
            : "We couldn't prepare that saving.",
        );
    } finally {
      if (alive.current) setBusy(false);
    }
  }
  async function save() {
    if (!prepared || chainId !== 10143 || !prepared.canCover) return;
    setBusy(true);
    setError(null);
    try {
      if (
        prepared.token.toLowerCase() !==
          status?.technical?.tokens.mUSD?.toLowerCase() ||
        prepared.vault.toLowerCase() !==
          status.technical.contracts.portfolioVault?.toLowerCase()
      )
        throw new Error(
          "The saving review doesn't match this deployment. Review it again.",
        );
      const wallet = await getWalletClient();
      if (!alive.current) return;
      const deployment = {
        chainId,
        contracts: { portfolioVault: prepared.vault },
        tokens: { mUSD: prepared.token },
      };
      if (prepared.needsApproval) {
        if (!alive.current) return;
        setStep("Confirm the exact token allowance");
        const approval = await approveToken(
          wallet,
          deployment,
          prepared.token,
          BigInt(prepared.rawUnits),
        );
        await confirmOnChain(approval, { chainId, rpcUrl });
        if (alive.current)
          setPrepared((current) =>
            current ? { ...current, needsApproval: false } : current,
          );
      }
      if (!alive.current) return;
      setStep("Confirm your saving");
      const hash = await deposit(
        wallet,
        deployment,
        prepared.token,
        BigInt(prepared.rawUnits),
      );
      await confirmOnChain(hash, { chainId, rpcUrl });
      if (alive.current) setReceipt(hash);
      await apiPost("/api/money/confirm", { receipt: hash, kind: "add" }).catch(
        () => undefined,
      );
      await refresh();
    } catch (problem) {
      if (alive.current)
        setError(
          `${walletActionMessage(problem, "The saving could not finish.")} Any confirmed approval remains in your account.`,
        );
    } finally {
      if (alive.current) {
        setBusy(false);
        setStep("");
      }
    }
  }
  return (
    <Card>
      <SectionTitle hint="Save exact mUSD quantities while portfolio pricing is paused. This adds only demo dollars; it does not split them across other investments.">
        Save demo dollars directly
      </SectionTitle>
      <Field htmlFor="direct-save-amount" label="Amount in mUSD">
        <TextField
          id="direct-save-amount"
          inputMode="decimal"
          value={amount}
          disabled={busy}
          onChange={(event) => {
            setAmount(event.target.value);
            setPrepared(null);
            setReceipt(null);
          }}
        />
      </Field>
      {!prepared ? (
        <Button className="mt-4" onClick={prepare} busy={busy}>
          Review saving
        </Button>
      ) : (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-5 rounded-2xl bg-sunken p-4"
        >
          <h3 className="font-semibold">
            Save {prepared.units} mUSD to your plan
          </h3>
          <p className="mt-2 text-sm text-ink-soft">
            Only your account can withdraw these tokens. Portfolio allocation
            and dollar progress return after prices are restored.
          </p>
          {!prepared.canCover ? (
            <p className="mt-3 text-sm text-warn">
              You need more test money before saving this amount.
            </p>
          ) : null}
          {receipt ? (
            <div className="mt-4">
              <Notice tone="ok" title="Your demo dollars are saved">
                <ReceiptLink reference={receipt} />
              </Notice>
              <Button className="mt-3" variant="secondary" href="/app/money">
                See your assets
              </Button>
            </div>
          ) : (
            <Button
              className="mt-4"
              disabled={!prepared.canCover}
              busy={busy}
              busyLabel={step || "Preparing…"}
              onClick={save}
            >
              Save {prepared.units} mUSD
            </Button>
          )}
        </motion.div>
      )}
      {error ? (
        <div className="mt-4">
          <Notice tone="warn">{error}</Notice>
        </div>
      ) : null}
    </Card>
  );
}
