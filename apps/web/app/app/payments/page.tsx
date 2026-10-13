"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Card,
  Field,
  Notice,
  PageHeader,
  TextField,
} from "@/components/ui";
import { useWallet } from "@/components/wallet-context";
import { WalletButton } from "@/components/wallet-button";
import { usePortfolio } from "@/components/portfolio-provider";
import { PAYMENT_CHAIN, paymentRequestPath } from "@/lib/payment-request";

export default function PaymentsPage() {
  const router = useRouter();
  const { address, loggedIn, chainId } = useWallet();
  const { status } = usePortfolio();
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("10");
  const [purpose, setPurpose] = useState("");
  const [link, setLink] = useState("");
  const [feedback, setFeedback] = useState("");
  const [error, setError] = useState("");
  const available =
    status?.ready &&
    status.network.reachable &&
    chainId === PAYMENT_CHAIN &&
    status.technical?.tokens.mUSD;

  function createRequest() {
    setError("");
    setFeedback("");
    setLink("");
    try {
      if (!address)
        throw new Error("Enter the testnet demo to request a payment.");
      setLink(
        new URL(
          paymentRequestPath(address, amount, purpose),
          window.location.origin,
        ).href,
      );
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Couldn't create the request.",
      );
    }
  }
  function send() {
    setError("");
    try {
      router.push(paymentRequestPath(recipient, amount, purpose));
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Check the recipient and amount.",
      );
    }
  }
  async function share() {
    setError("");
    setFeedback("");
    try {
      if (navigator.share && navigator.canShare?.({ url: link })) {
        await navigator.share({
          title: "Modalis demo payment request",
          url: link,
        });
        setFeedback("Request shared.");
      } else {
        await navigator.clipboard.writeText(link);
        setFeedback("Request link copied.");
      }
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(
        "Couldn't share automatically. Select and copy the request link below.",
      );
    }
  }
  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <PageHeader
        title="Payments, made simple"
        lede="Send demo dollars, share a request, or save together. Every transfer asks for your approval and confirms on Monad Testnet."
      />
      <Notice>
        Testnet demonstration only. mUSD has no monetary value. A request link
        never moves money by itself.
      </Notice>
      {!loggedIn ? (
        <Card>
          <p className="mb-4 text-sm text-ink-soft">
            Enter the testnet demo to send or request a payment.
          </p>
          <WalletButton signIn />
        </Card>
      ) : null}
      {loggedIn && status && !available ? (
        <Notice tone="warn">
          Payments are unavailable on this deployment. Check the network and
          demo token configuration.
        </Notice>
      ) : null}
      {error ? <Notice tone="breach">{error}</Notice> : null}
      {loggedIn && available ? (
        <Card>
          <h2 className="mb-5 text-xl font-semibold">Send or request</h2>
          <div className="space-y-4">
            <Field label="Demo dollars (mUSD)" htmlFor="payment-amount">
              <TextField
                id="payment-amount"
                inputMode="decimal"
                value={amount}
                onChange={(e) => {
                  setAmount(e.target.value);
                  setLink("");
                }}
              />
            </Field>
            <Field
              label="What is it for?"
              htmlFor="payment-purpose"
              hint="Optional; visible to anyone with the link."
            >
              <TextField
                id="payment-purpose"
                maxLength={80}
                value={purpose}
                onChange={(e) => {
                  setPurpose(e.target.value);
                  setLink("");
                }}
                placeholder="Birthday gift, shared meal, school fees…"
              />
            </Field>
            <Button onClick={createRequest}>Create a request link</Button>
            {link ? (
              <div className="space-y-3 rounded-2xl bg-sunken p-4">
                <Field label="Your request link" htmlFor="request-link">
                  <TextField
                    id="request-link"
                    readOnly
                    value={link}
                    onFocus={(e) => e.target.select()}
                  />
                </Field>
                <Button variant="secondary" onClick={share}>
                  Share or copy request
                </Button>
                {feedback ? (
                  <p role="status" className="text-sm text-ok">
                    {feedback}
                  </p>
                ) : null}
              </div>
            ) : null}
            <div className="border-t border-line pt-5">
              <Field
                label="Recipient wallet address"
                htmlFor="payment-recipient"
              >
                <TextField
                  id="payment-recipient"
                  spellCheck={false}
                  autoComplete="off"
                  value={recipient}
                  onChange={(e) => setRecipient(e.target.value)}
                  placeholder="0x…"
                />
              </Field>
              <div className="mt-4">
                <Button variant="secondary" onClick={send}>
                  Review a payment
                </Button>
              </div>
            </div>
          </div>
        </Card>
      ) : null}
      <div className="grid gap-4 sm:grid-cols-2">
        {status?.technical?.contracts.savingsCircle ? (
          <Card>
            <h2 className="text-lg font-semibold">Save together</h2>
            <p className="my-3 text-sm text-ink-soft">
              Fixed contributions, a rotating recipient, and refunds if a round
              fails.
            </p>
            <Button variant="secondary" href="/app/circles">
              Open savings circles
            </Button>
          </Card>
        ) : null}
        <Card>
          <h2 className="text-lg font-semibold">Need demo dollars?</h2>
          <p className="my-3 text-sm text-ink-soft">
            Use the test faucet, then approve each transfer from your account.
          </p>
          <Button variant="secondary" href="/app/add-money">
            Get test money
          </Button>
        </Card>
      </div>
    </div>
  );
}
