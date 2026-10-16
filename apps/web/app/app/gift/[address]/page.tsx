"use client";

/**
 * Gift a goal: anyone with the link can send demo dollars toward someone's goal, like a birthday
 * or school-fees collection.
 *
 * The gift is a plain token transfer to the recipient's wallet, signed by the giver. It does not
 * touch the recipient's plan: only they can add money to it, so the gift waits in their wallet
 * until they choose to. That keeps the rule that nobody else can change their plan.
 */
import { use, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { MockERC20Abi, isOutOfGasFundsError } from "@modalis/chain";
import { getAddress, isAddress, parseUnits, type Address } from "viem";
import { Button, Card, TextField, Notice, PageHeader } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { ConfirmedIn } from "@/components/confirmed-in";
import { usePortfolio } from "@/components/portfolio-provider";
import { useWallet } from "@/components/wallet-context";
import { confirmOnChain } from "@/lib/chain-client";
import {
  PAYMENT_CHAIN,
  paymentAmount,
  readPaymentRequest,
} from "@/lib/payment-request";
import { WalletButton } from "@/components/wallet-button";
import { shortAddress } from "@/lib/format";
import { walletActionMessage } from "@/lib/wallet-error";

/** mUSD, the demo dollar, has 6 decimals (contracts/script/Deploy.s.sol). */
const USD_DECIMALS = 6;

export default function GiftPage({
  params,
}: {
  params: Promise<{ address: string }>;
}) {
  const { address: raw } = use(params);
  const query = useSearchParams();
  const goal = (query.get("for") ?? "").slice(0, 80);
  const requested = readPaymentRequest(query);
  const {
    loggedIn,
    address: me,
    chainId,
    rpcUrl,
    getWalletClient,
  } = useWallet();
  const { status } = usePortfolio();
  const token = (
    status?.technical?.tokens as Record<string, Address> | undefined
  )?.mUSD;

  const account = useRef(me);
  account.current = me;
  const [amount, setAmount] = useState(String(requested.amount));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<{
    hash: string;
    ms: number | null;
    amount: string;
  } | null>(null);

  useEffect(() => {
    setAmount(String(requested.amount));
    setSent(null);
    setError(null);
  }, [raw, query.toString(), me]);
  if (!isAddress(raw) || /^0x0{40}$/i.test(raw)) {
    return (
      <Notice tone="breach">
        This gift link is broken: it doesn&rsquo;t contain a wallet address.
      </Notice>
    );
  }
  const to = getAddress(raw);
  const isSelf = me?.toLowerCase() === to.toLowerCase();

  async function give() {
    if (
      !token ||
      requested.error ||
      chainId !== PAYMENT_CHAIN ||
      !paymentAmount(amount)
    )
      return;
    setBusy(true);
    setError(null);
    try {
      const wallet = await getWalletClient();
      if (!wallet.account) throw new Error("Connect a wallet first.");
      if (wallet.chain?.id !== PAYMENT_CHAIN)
        throw new Error("Switch your wallet to Monad Testnet before paying.");
      const hash = await wallet.writeContract({
        address: token,
        abi: MockERC20Abi,
        functionName: "transfer",
        args: [to, parseUnits(amount, USD_DECIMALS)],
        account: wallet.account,
        chain: wallet.chain,
      });
      const { ms } = await confirmOnChain(hash, { chainId, rpcUrl });
      if (account.current === me) setSent({ hash, ms, amount });
    } catch (err) {
      if (account.current !== me) return;
      setError(
        isOutOfGasFundsError(err)
          ? "Your wallet needs a little MON for the network fee. Get some on the Add money page."
          : /exceeds balance|insufficient/i.test(String(err))
            ? "You don't have that many demo dollars. Get test money on the Add money page first."
            : walletActionMessage(err, "That didn't go through. Nothing was sent."),
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
      {!loggedIn ? (
        <Card>
          <p className="mb-3 text-sm">
            Enter the testnet demo to review and send this payment.
          </p>
          <WalletButton signIn />
        </Card>
      ) : null}
      {requested.error ? (
        <Notice tone="breach">{requested.error}</Notice>
      ) : null}
      {chainId !== PAYMENT_CHAIN ? (
        <Notice tone="warn">Only Monad Testnet payments are supported.</Notice>
      ) : null}
      {isSelf ? (
        <Notice>
          This is your own gift link. Share it with the people who want to help.
        </Notice>
      ) : null}
      {error ? <Notice tone="breach">{error}</Notice> : null}

      {sent ? (
        <Notice tone="ok" title="Gift sent">
          $
          {Number(sent.amount).toLocaleString("en-US", {
            maximumFractionDigits: 6,
          })}{" "}
          is in their wallet. <ReceiptLink reference={sent.hash} />{" "}
          <ConfirmedIn ms={sent.ms} />
        </Notice>
      ) : loggedIn &&
        !isSelf &&
        !requested.error &&
        chainId === PAYMENT_CHAIN ? (
        <Card>
          <dl className="mb-5 rounded-2xl bg-sunken p-4 text-sm">
            <dt className="text-ink-muted">Recipient</dt>
            <dd className="mt-1 break-all font-mono text-xs">{to}</dd>
            <dt className="mt-3 text-ink-muted">Network and token</dt>
            <dd className="mt-1">Monad Testnet · mUSD</dd>
          </dl>
          <label
            htmlFor="gift"
            className="block text-[14.5px] font-medium text-ink"
          >
            How much (demo dollars)
          </label>
          <div className="mt-2.5 max-w-xs">
            <TextField
              id="gift"
              inputMode="decimal"
              disabled={busy}
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
            {amount && !paymentAmount(amount) ? (
              <p role="alert" className="mt-2 text-xs text-breach">
                Use a positive amount up to 1,000,000, with at most six decimal
                places.
              </p>
            ) : null}
          </div>
          <div className="mt-5">
            <Button
              onClick={give}
              busy={busy}
              busyLabel="Sending…"
              disabled={
                busy ||
                !paymentAmount(amount) ||
                !token ||
                !status?.ready ||
                !status.network.reachable
              }
            >
              {paymentAmount(amount)
                ? `Send $${Number(amount).toLocaleString("en-US", { maximumFractionDigits: 6 })}`
                : "Enter a valid amount"}
            </Button>
          </div>
          <p className="mt-3 text-[13px] text-ink-muted">
            Test network: these are demo dollars, worth nothing.
          </p>
        </Card>
      ) : null}
    </div>
  );
}
