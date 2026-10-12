"use client";

/**
 * Gift a goal: anyone with the link can send demo dollars toward someone's goal, like a birthday
 * or school-fees collection.
 *
 * The gift is a plain token transfer to the recipient's wallet, signed by the giver. It does not
 * touch the recipient's plan: only they can add money to it, so the gift waits in their wallet
 * until they choose to. That keeps the rule that nobody else can change their plan.
 */
import { use, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MockERC20Abi, isOutOfGasFundsError } from "@modalis/chain";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { Button, Card, MoneyField, Notice, PageHeader } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { ConfirmedIn } from "@/components/confirmed-in";
import { usePortfolio } from "@/components/portfolio-provider";
import { useWallet } from "@/components/wallet-context";
import { confirmOnChain } from "@/lib/chain-client";
import { shortAddress } from "@/lib/format";

/** mUSD, the demo dollar, has 6 decimals (contracts/script/Deploy.s.sol). */
const USD_DECIMALS = 6;

export default function GiftPage({ params }: { params: Promise<{ address: string }> }) {
  const { address: raw } = use(params);
  const goal = (useSearchParams().get("for") ?? "").slice(0, 80);
  const { loggedIn, address: me, chainId, rpcUrl, getWalletClient } = useWallet();
  const { status } = usePortfolio();
  const token = (status?.technical?.tokens as Record<string, Address> | undefined)?.mUSD;

  const [amount, setAmount] = useState(25);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{ hash: string; ms: number | null } | null>(null);

  if (!isAddress(raw)) {
    return <Notice tone="breach">This gift link is broken: it doesn&rsquo;t contain a wallet address.</Notice>;
  }
  const to = getAddress(raw);
  const isSelf = me?.toLowerCase() === to.toLowerCase();

  async function give() {
    if (!token) return;
    setBusy(true);
    setError(null);
    try {
      const wallet = await getWalletClient();
      if (!wallet.account) throw new Error("Connect a wallet first.");
      const hash = await wallet.writeContract({
        address: token,
        abi: MockERC20Abi,
        functionName: "transfer",
        args: [to, parseUnits(String(amount), USD_DECIMALS)],
        account: wallet.account,
        chain: wallet.chain,
      });
      const { ms } = await confirmOnChain(hash, { chainId, rpcUrl });
      setSent({ hash, ms });
    } catch (err) {
      setError(
        isOutOfGasFundsError(err)
          ? "Your wallet needs a little MON for the network fee. Get some on the Add money page."
          : /exceeds balance|insufficient/i.test(String(err))
            ? "You don't have that many demo dollars. Get test money on the Add money page first."
            : err instanceof Error
              ? err.message.split("\n")[0]
              : "That didn't go through. Nothing was sent.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <PageHeader
        title={goal ? `A gift toward “${goal}”` : "Send a gift toward a goal"}
        lede={`Your gift goes straight to ${shortAddress(to)}'s wallet on Monad. They decide when to add it to their plan; nobody else can.`}
      />
      {!loggedIn ? <Notice tone="warn">Sign in to send a gift. It takes a few seconds with email.</Notice> : null}
      {isSelf ? <Notice>This is your own gift link. Share it with the people who want to help.</Notice> : null}
      {error ? <Notice tone="breach">{error}</Notice> : null}

      {sent ? (
        <Notice tone="ok" title="Gift sent">
          ${amount.toLocaleString("en-US")} is in their wallet. <ReceiptLink reference={sent.hash} />{" "}
          <ConfirmedIn ms={sent.ms} />
        </Notice>
      ) : loggedIn && !isSelf ? (
        <Card>
          <label htmlFor="gift" className="block text-[14.5px] font-medium text-ink">
            How much (demo dollars)
          </label>
          <div className="mt-2.5 max-w-xs">
            <MoneyField id="gift" value={amount} min={1} max={1_000_000} onChange={setAmount} />
          </div>
          <div className="mt-5">
            <Button onClick={give} busy={busy} busyLabel="Sending…" disabled={busy || amount <= 0 || !token}>
              Send ${amount.toLocaleString("en-US")}
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">Test network: these are demo dollars, worth nothing.</p>
        </Card>
      ) : null}
    </div>
  );
}
