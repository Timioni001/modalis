"use client";

/**
 * Savings circles: ajo, esusu, chama, tanda, susu. A group pays the same amount every round and
 * one member takes the whole pot, in turn, until everyone has had it once.
 *
 * The rules live in contracts/src/SavingsCircle.sol, not here: nobody can skip the order, take the
 * pot early, or keep someone's money if a round falls through. This page only reads the circle
 * and asks the member's own wallet to sign.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  createCircle,
  isOutOfGasFundsError,
  isOverdue,
  payIntoCircle,
  potOf,
  readCirclesOf,
  recipientOf,
  refundFromCircle,
  type Circle,
} from "@modalis/chain";
import { formatUnits, getAddress, isAddress, parseUnits, type Address } from "viem";
import { Badge, Button, Card, Empty, Field, Notice, PageHeader, SectionTitle, TextField } from "@/components/ui";
import { ReceiptLink } from "@/components/receipt-link";
import { ConfirmedIn } from "@/components/confirmed-in";
import { usePortfolio } from "@/components/portfolio-provider";
import { useWallet } from "@/components/wallet-context";
import { browserClient, confirmOnChain } from "@/lib/chain-client";
import { shortAddress } from "@/lib/format";

/** mUSD, the demo dollar, has 6 decimals (contracts/script/Deploy.s.sol). */
const USD_DECIMALS = 6;
const ROUNDS = [
  { label: "Every day", seconds: 86_400 },
  { label: "Every week", seconds: 604_800 },
  { label: "Every month", seconds: 2_592_000 },
  { label: "Every 5 minutes (for a demo)", seconds: 300 },
];

const usd = (v: bigint) =>
  `$${Number(formatUnits(v, USD_DECIMALS)).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

function timeLeft(deadline: number): string {
  const s = deadline - Math.floor(Date.now() / 1000);
  if (s <= 0) return "deadline passed";
  if (s < 3600) return `${Math.ceil(s / 60)} min left`;
  if (s < 86_400) return `${Math.round(s / 3600)} h left`;
  return `${Math.round(s / 86_400)} days left`;
}

export default function CirclesPage() {
  const { loggedIn, address, chainId, rpcUrl, getWalletClient } = useWallet();
  const { status } = usePortfolio();
  const contracts = status?.technical?.contracts as Record<string, Address> | undefined;
  const tokens = status?.technical?.tokens as Record<string, Address> | undefined;
  const deployment = useMemo(
    () => ({ chainId, contracts: contracts ?? {}, tokens: tokens ?? {} }),
    [chainId, contracts, tokens],
  );
  const deployed = Boolean(contracts?.savingsCircle);

  const [circles, setCircles] = useState<Circle[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<{ hash: string; ms: number | null; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!address || !deployed) return;
    try {
      setCircles(await readCirclesOf(browserClient(chainId, rpcUrl), deployment, address));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't read your circles.");
    }
  }, [address, deployed, chainId, rpcUrl, deployment]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = useCallback(
    async (key: string, text: string, send: () => Promise<`0x${string}`>) => {
      setBusy(key);
      setError(null);
      setDone(null);
      try {
        const hash = await send();
        const { ms } = await confirmOnChain(hash, { chainId, rpcUrl });
        setDone({ hash, ms, text });
        await load();
      } catch (err) {
        setError(
          isOutOfGasFundsError(err)
            ? "Your wallet needs a little MON for the network fee. Get some on the Add money page."
            : err instanceof Error
              ? err.message.split("\n")[0]
              : "That didn't go through. Nothing was charged.",
        );
      } finally {
        setBusy(null);
      }
    },
    [chainId, rpcUrl, load],
  );

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Savings circles"
        lede="Ajo, esusu, chama, susu: a group pays the same amount each round and one member takes the whole pot, in turn. A contract on Monad keeps the order and holds the money, so nobody has to be trusted with it."
      />

      {!loggedIn ? <Notice tone="warn">Sign in to start or join a circle.</Notice> : null}
      {loggedIn && !deployed ? (
        <Notice tone="warn" title="Not switched on yet">
          The savings circle contract isn&rsquo;t deployed on this network yet.
        </Notice>
      ) : null}
      {error ? <Notice tone="breach">{error}</Notice> : null}
      {done ? (
        <Notice tone="ok" title={done.text}>
          <ReceiptLink reference={done.hash} /> <ConfirmedIn ms={done.ms} />
        </Notice>
      ) : null}

      {loggedIn && deployed && address ? (
        <>
          {circles === null ? null : circles.length === 0 ? (
            <Empty title="You're not in a circle yet">
              Start one below with the people you save with. Each of them needs a Modalis wallet address.
            </Empty>
          ) : (
            circles.map((c) => (
              <CircleCard
                key={c.id.toString()}
                circle={c}
                me={address}
                busy={busy}
                onPay={() =>
                  run(`pay-${c.id}`, "Your share is in", async () =>
                    payIntoCircle(await getWalletClient(), browserClient(chainId, rpcUrl), deployment, c),
                  )
                }
                onRefund={() =>
                  run(`refund-${c.id}`, "Your payment is back in your wallet", async () =>
                    refundFromCircle(await getWalletClient(), deployment, c.id),
                  )
                }
              />
            ))
          )}

          <NewCircle
            me={address}
            busy={busy === "create"}
            onCreate={(input) =>
              run("create", "Circle started", async () =>
                createCircle(await getWalletClient(), deployment, {
                  ...input,
                  token: getAddress(tokens!.mUSD),
                }),
              )
            }
            canCreate={Boolean(tokens?.mUSD)}
          />
        </>
      ) : null}
    </div>
  );
}

function CircleCard({
  circle: c,
  me,
  busy,
  onPay,
  onRefund,
}: {
  circle: Circle;
  me: Address;
  busy: string | null;
  onPay: () => void;
  onRefund: () => void;
}) {
  const myIndex = c.members.findIndex((m) => m.toLowerCase() === me.toLowerCase());
  const iPaid = myIndex >= 0 && c.paidThisRound[myIndex];
  const overdue = isOverdue(c);
  const recipient = recipientOf(c);
  const myTurn = myIndex >= 0 ? myIndex + 1 : null;

  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle hint={`${usd(c.contribution)} each round · pot ${usd(potOf(c))}`}>{c.name || "Savings circle"}</SectionTitle>
        <Badge tone={c.status === "completed" ? "ok" : c.status === "stopped" || overdue ? "warn" : "accent"} dot>
          {c.status === "completed"
            ? "Finished: everyone was paid"
            : c.status === "stopped"
              ? "Stopped"
              : overdue
                ? "A payment was missed"
                : `Round ${c.round + 1} of ${c.members.length} · ${timeLeft(c.roundDeadline)}`}
        </Badge>
      </div>

      <ol className="mt-3 space-y-px overflow-hidden rounded-2xl bg-line">
        {c.members.map((m, i) => {
          const isMe = i === myIndex;
          const received = c.status === "completed" || i < c.round;
          const isRecipient = c.status === "active" && i === c.round;
          return (
            <li key={m} className="flex items-center justify-between gap-3 bg-surface px-4 py-3 text-sm">
              <span className="text-ink">
                <span className="numeric text-ink-muted">{i + 1}.</span>{" "}
                {isMe ? <strong>You</strong> : <span className="numeric">{shortAddress(m)}</span>}
                {isRecipient ? <span className="text-ink-muted"> · gets this pot</span> : null}
                {received ? <span className="text-ink-muted"> · had the pot</span> : null}
              </span>
              {c.status !== "completed" ? (
                <Badge tone={c.paidThisRound[i] ? "ok" : "default"}>{c.paidThisRound[i] ? "Paid" : "Not yet"}</Badge>
              ) : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-4 space-y-2 text-sm text-ink-soft">
        {c.status === "active" && !overdue ? (
          <p>
            When everyone has paid, the contract sends {usd(potOf(c))} straight to{" "}
            {recipient.toLowerCase() === me.toLowerCase() ? "you" : shortAddress(recipient)}.
            {myTurn ? ` Your turn is round ${myTurn}.` : ""}
          </p>
        ) : null}
        {overdue || c.status === "stopped" ? (
          <p>
            Someone didn&rsquo;t pay before the deadline, so this circle has stopped. Anyone who paid into this
            round takes their money back; nobody else can touch it.
          </p>
        ) : null}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        {c.status === "active" && !overdue && myIndex >= 0 && !iPaid ? (
          <Button onClick={onPay} busy={busy === `pay-${c.id}`} busyLabel="Paying…" disabled={busy !== null}>
            Pay my {usd(c.contribution)}
          </Button>
        ) : null}
        {(overdue || c.status === "stopped") && iPaid ? (
          <Button variant="secondary" onClick={onRefund} busy={busy === `refund-${c.id}`} busyLabel="Refunding…" disabled={busy !== null}>
            Take my payment back
          </Button>
        ) : null}
        {c.status === "active" && !overdue && iPaid ? (
          <p className="text-sm text-ink-muted">You&rsquo;ve paid this round. Waiting for the others.</p>
        ) : null}
      </div>
    </Card>
  );
}

function NewCircle({
  me,
  busy,
  canCreate,
  onCreate,
}: {
  me: Address;
  busy: boolean;
  canCreate: boolean;
  onCreate: (input: { name: string; contribution: bigint; roundSeconds: number; members: Address[] }) => void;
}) {
  const [name, setName] = useState("");
  const [amount, setAmount] = useState("50");
  const [round, setRound] = useState(ROUNDS[1].seconds);
  const [others, setOthers] = useState("");
  const [problem, setProblem] = useState<string | null>(null);

  function submit() {
    setProblem(null);
    const list = others
      .split(/[\s,;]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const bad = list.find((a) => !isAddress(a));
    if (bad) return setProblem(`"${bad}" isn't a wallet address.`);
    const members = [me, ...list.map((a) => getAddress(a))];
    if (new Set(members.map((m) => m.toLowerCase())).size !== members.length)
      return setProblem("Each person can only be in the circle once.");
    if (members.length < 2) return setProblem("Add at least one other person.");
    if (members.length > 20) return setProblem("A circle can have at most 20 people.");
    let contribution: bigint;
    try {
      contribution = parseUnits(amount || "0", USD_DECIMALS);
    } catch {
      return setProblem("Enter an amount like 50 or 12.50.");
    }
    if (contribution <= 0n) return setProblem("Enter an amount above zero.");
    onCreate({ name: name.trim() || "Savings circle", contribution, roundSeconds: round, members });
  }

  return (
    <Card>
      <SectionTitle hint="You take the pot first; the others follow in the order you list them.">Start a circle</SectionTitle>
      <div className="mt-2 space-y-4">
        <Field label="Name" htmlFor="circle-name">
          <TextField id="circle-name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Family ajo" maxLength={60} />
        </Field>
        <Field label="Each person pays (demo dollars)" htmlFor="circle-amount">
          <TextField id="circle-amount" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="How often" htmlFor="circle-round">
          <select
            id="circle-round"
            value={round}
            onChange={(e) => setRound(Number(e.target.value))}
            className="min-h-[52px] w-full rounded-2xl bg-surface px-4 text-[15px] text-ink shadow-[var(--shadow-card)]"
          >
            {ROUNDS.map((r) => (
              <option key={r.seconds} value={r.seconds}>
                {r.label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label="The other members"
          hint="Their wallet addresses, one per line, in payout order. They can find theirs in Settings."
          htmlFor="circle-members"
          error={problem ?? undefined}
        >
          <textarea
            id="circle-members"
            rows={4}
            value={others}
            onChange={(e) => setOthers(e.target.value)}
            placeholder={"0x…\n0x…"}
            className="numeric w-full rounded-2xl bg-surface px-4 py-3 text-[14px] text-ink shadow-[var(--shadow-card)] outline-none"
          />
        </Field>
        <Button onClick={submit} busy={busy} busyLabel="Starting…" disabled={busy || !canCreate}>
          Start the circle
        </Button>
      </div>
    </Card>
  );
}
