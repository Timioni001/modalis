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

**0:20 — the interview.** Five questions, none of them financial jargon. The one that matters:
*your portfolio falls 12% — what do you do?* "Sell everything" and "invest more" describe very
different investors even when both claim to tolerate a 15% fall.

**0:45 — the mandate.** *"This is the policy Modalis will use to manage your portfolio."*
A goal, a date, a drawdown ceiling, a liquidity floor, a concentration cap, a rebalance threshold,
and the allocation — with the reasoning behind every number. Approve.

Say this out loud: **the user is not handing an AI their money. They are approving a policy, and
the contract will refuse anything outside it.**

**1:05 — onchain.** `setMandate` settles on Monad. Fund the portfolio. Real positions appear.

**1:30 — the breach.** Run the market move. The largest holding is repriced past its limit. The
dashboard turns red and names the rule: *mBOND grew to 33.0% of your portfolio, above the 30.0%
limit you approved for any single asset.*

The price is synthetic and the UI says so. Everything after it is real.

**1:55 — the proposal.** Modalis explains what it will do and why, in plain language, and shows
that it has already simulated the trade against live chain state.

**2:15 — the security moment.** Press **Run the security test**. A well-formed, correctly signed
proposal that would concentrate the portfolio past its cap is submitted *for real*.

> **The contract rejected the invalid action (MAX_ALLOCATION_EXCEEDED)**
> Transaction `0x17e4ca…` — reverted on-chain. Portfolio unchanged: **yes**.

This is the whole thesis in one transaction. The proposal was valid in every mechanical sense.
Only the mandate stopped it.

**2:35 — execution.** Now the valid rebalance. It settles on Monad, the vault re-measures its own
balances, and the mandate re-validates the result before the transaction is allowed to succeed.
The dashboard updates: back inside every rule.

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

## Honest framing

Say these plainly; they make the rest more credible, not less:

- The **price move is simulated** — that is what "controlled scenario" means. The breach, the
  proposal, the contract's decision and the settlement are all real.
- Demo tokens are **not real investment assets**.
- Where Kuru is not configured, execution runs through a **demo adapter that is not a venue** — and
  the UI labels it that way.
- This is a **prototype**, not an investment adviser, broker or fund. No return is promised.

See `README.md` for exactly what is verified by execution and what still needs credentials.
