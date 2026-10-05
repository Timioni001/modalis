# Demo

## The story

A person wants **$20,000 for a house in five years**. They have $10,000 to start and can add $200
a month. They will accept a 15% fall at most, and some of the money needs to stay reachable.

They never choose a token.

## Run it

```bash
bash scripts/setup.sh       # once
bash scripts/demo-local.sh  # the whole loop, against a real local chain
```

Eleven steps, every transaction real, every hash from the node. The report is written to
`docs/e2e-run.md`.

For the UI:

```bash
# terminal 1
anvil --chain-id 10143
# terminal 2
pnpm contracts:deploy:local
MODALIS_RPC_URL=http://127.0.0.1:8545 DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true \
  MANAGER_PRIVATE_KEY=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a \
  DEPLOYER_PRIVATE_KEY=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80 \
  pnpm dev
```

Those are the well-known anvil test keys. They hold nothing on any real network.

## Three-minute script

**0:00 — the problem.** "Most people don't struggle to say what they want their money to do. They
struggle to continuously manage the portfolio that gets them there."

**0:20 — the questions.** Five of them, none financial. The one that matters: *your money falls
12% — what do you do?* "Sell everything" and "invest more" describe very different people even
when both say they'd accept a 15% fall.

**0:45 — the plan.** *"This is how Modalis will manage your money."* A goal, a date, and four
limits in plain language — how much you're comfortable losing, how much money stays available, the
most that can sit in one investment, and how far off target something can drift before Modalis
steps in. Plus how the money is spread, with the reasoning behind every number. Approve.

Say this out loud: **they are not handing an AI their money. They are setting limits, and the
limits are not enforced by Modalis.**

Nothing on that screen says mandate, allocation, basis point or drawdown. Everything behind it
does — `packages/domain` is the only place one becomes the other.

**1:05 — add money.** The plan goes live, then: *how much would you like to add?* Modalis works
out the split from the plan's own targets and walks the steps. **Each one is signed by them** —
no Modalis key can put money in, which is the same reason none can take it out. Real positions
appear.

**1:30 — off plan.** Run the market move. The largest holding is repriced past its limit. The
screen names the rule in their words: *Bitcoin grew to 32.7% of your money, above the 30% limit
you set for any one investment.*

The price is synthetic and the UI says so. Everything after it is real.

**1:55 — the recommended adjustment.** Modalis explains what it would do and why, and has
**already checked it against their rules** before asking. That matters: a person is never asked to
approve something their own limits would refuse.

**2:15 — the security moment.** Press **Run the security test**. A well-formed, correctly signed
proposal that would concentrate the portfolio past its cap is submitted *for real*.

> **The contract rejected the invalid action (MAX_ALLOCATION_EXCEEDED)**
> Transaction `0x17e4ca…` — reverted on-chain. Portfolio unchanged: **yes**.

This is the whole thesis in one transaction. The proposal was valid in every mechanical sense.
Only the mandate stopped it.

**2:35 — the adjustment.** Now the valid one. It settles, the vault re-measures its own balances,
and the rules re-validate the result before the transaction is allowed to succeed. Back inside
every limit, with a receipt.

**2:50 — the line.**

> "Modalis doesn't ask you what to trade. It asks what your money needs to accomplish."

## What to say if asked

**"Why isn't this just Betterment?"**
The portfolio management isn't new. What's new is that the *policy* is programmable and
enforceable. The AI doesn't get unrestricted control of funds — it proposes against a
user-approved mandate, and Monad contracts enforce what can happen. We can show you a transaction
where the contract refused the AI.

**"Why blockchain?"**
Because the portfolio stops being a database record. Its ownership, rules, positions and state
transitions become executable financial state that the user can verify and exit from unilaterally.
The manager key cannot withdraw. That's not a policy, it's a revert.

**"Why Monad?"**
We maintain a portfolio continuously, not a static vault. Every rebalance, contribution and state
transition settles on-chain. High-throughput, low-cost EVM execution is what makes that model
practical rather than theoretical.

**"Is the AI making the trades?"**
It proposes them. Every proposal is re-checked on-chain for authorisation, mandate version,
deadline, replay, slippage, venue approval and post-trade compliance. Press the security test and
watch one get rejected.

**"Where did all the crypto language go?"**
Into the implementation, where it belongs. The contracts still have their precise names and the
mandate still does the enforcing — a person just never has to read the word. `packages/domain` is
the boundary, and a test sweeps every user-facing sentence to keep it honest. The one place the
infrastructure is still named is the status panel, because claiming an integration you do not have
is worse than naming the ones you do.

**"Can the server act on someone else's plan?"**
No. The account comes from a verified sign-in and nothing else — not from a request body, a path
or a query string — and a static audit over every route in the app fails the build if that
changes. Even then, authentication is the outer gate: the contract is still the one that decides
what is allowed.

## Honest framing

Say these plainly; they make the rest more credible, not less:

- The **price move is simulated** — that is what "controlled scenario" means. The breach, the
  proposal, the contract's decision and the settlement are all real.
- Demo tokens are **not real investment assets**.
- Where Kuru is not configured, execution runs through a **demo adapter that is not a venue** — and
  the UI labels it that way.
- This is a **prototype**, not an investment adviser, broker or fund. No return is promised.

See `README.md` for exactly what is verified by execution and what still needs credentials.
