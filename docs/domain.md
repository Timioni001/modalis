# The product

**Turn your goal into a plan that manages itself.**

Modalis runs on a mandate contract, an orderbook venue, a verifiable compute network and an
indexer. A person who wants to save for a house deposit should never have to learn any of that.

This document is the boundary. Above it: goals, plans, money, progress, adjustments, activity.
Below it: `PortfolioMandate`, `RebalanceExecutor`, basis points, nonces, slippage, transaction
hashes. One file crosses it — `packages/domain/src/translate.ts` — and nothing above it is
permitted to know what is below.

The core rule: **technical concepts belong in the implementation, not in the user's vocabulary.**

---

## What a person sees

```
GOAL  →  PLAN  →  MONEY  →  PROGRESS  →  ADJUSTMENTS  →  ACTIVITY
```

| | |
|---|---|
| **Goal** | What you are saving for, how much, and by when. |
| **Plan** | The rules Modalis manages your money by. Only you can change them. |
| **Money** | What you actually have, right now. |
| **Progress** | Whether you are going to get there. |
| **Adjustments** | What Modalis suggests, and whether your rules allow it. |
| **Activity** | Everything that has happened, with a receipt for each. |

## The vocabulary

Every row is enforced by `packages/domain/src/terms.ts`, and the mapping is tested: a sentence in
the domain layer containing anything from the left-hand column fails the build
(`packages/domain/test/terms.test.ts`).

| Underneath | What a person reads |
|---|---|
| PortfolioMandate | Your plan |
| mandate version | Each time you change your plan |
| risk profile | Risk level — cautious, balanced, adventurous |
| target allocation | How your money is spread |
| rebalance | An adjustment |
| rebalance proposal | A recommended adjustment |
| maximum drawdown | How much you're comfortable losing |
| liquidity floor | Money kept available |
| concentration limit | Maximum in one investment |
| allocation drift | Your plan moving off target |
| rebalance threshold | When Modalis steps in |
| PortfolioVault | Your money |
| transaction hash | A receipt |
| settlement on Monad | Confirmed |
| mUSD / mBTC / mETH / mBOND | Cash / Bitcoin / Ethereum / Bonds |

Hidden entirely: `AssetRegistry`, `RebalanceExecutor`, `KuruAdapter`, `RiskSignalReceiver`, Kuru,
Chainlink CRE, Envio, Alchemy, basis points, nonces, adapters, slippage, oracles, gas, wei, ERC-20.

**Nothing here renames a contract.** `PortfolioMandate` is a precise and correct name for what it
does, and it keeps it. This layer sits above the Solidity; it does not reach into it.

### Where the infrastructure is still named

Two places, both deliberate:

- **`/api/status` and the status panel on the landing page.** Each capability is described by what
  it does for the person, with the provider named underneath — "Something independent of Modalis
  watches your plan · Chainlink CRE". An unconfigured integration reports as unconfigured rather
  than as a logo.
- **A "for anyone who wants to check" disclosure** of the addresses holding a person's limits.
  Verifiability is a feature of this product, and hiding the addresses would remove it. It is
  collapsed by default and no flow depends on reading it.

## How money is represented

| | |
|---|---|
| **Money** | `{ amount: "11031.67", currency: "USD" }` — a decimal **string**, full precision |
| **Percentages** | plain numbers. `30` means 30%, never 3000 |
| **Dates** | ISO strings. Never unix seconds |
| **Statuses** | words: `on_track`, `off_plan`, `recommended` — never codes |
| **Amounts of an investment** | a decimal string for display, plus `rawUnits` as an exact integer for acting on |

Internally money is `bigint` USD at 1e18 and token amounts are `uint256`. Neither fits in a
JavaScript number, so money is converted to a string exactly once, at the domain boundary, and
never to a float for arithmetic. `rawUnits` exists for the same reason: a wallet needs the exact
integer, and parsing the display string back would go through a float.

## The domain model

Defined in `packages/domain/src/models.ts`. These are the only shapes a user interface needs.

```
Goal        kind · name · target · targetDate · monthsRemaining · startingAmount · contribution
Plan        status · version · riskLevel · howMoneyIsSpread[] · rules · goal · summary
                                                              · adjustmentsEnabled
PlanRules   maxInOneInvestmentPercent · moneyKeptAvailablePercent
            comfortableLosingPercent · adjustWhenOffTargetByPercent
MoneyView   total · available · invested · holdings[] · isEmpty · asOf
Progress    status · saved · target · percentComplete · remaining
            monthlyToStayOnTrack · currentMonthlyContribution · summary
Adjustment  status · reasons[] · explanation · change · allowedByYourRules
                                            · blockedBecause · receipt
Activity    kind · title · detail · at · amount · receipt
FundingPlan total · steps[] · hasShortfall · shortfalls[]
Receipt     reference · url · confirmed · at
Capabilities canCreatePlan · canFund · canAdjust · limitations[]
```

`Capabilities` is why the UI can disable an action with a real reason instead of failing when
pressed: `/api/status` reports what this deployment actually has configured.

### Progress promises nothing

`monthlyToStayOnTrack` assumes **zero** investment growth. Modalis does not know what the market
will do and will not imply that it does, so the honest figure is the one framed in money the
person adds. There is no projected return anywhere in the model, and the tests assert that the
wording contains none.

## The API

Every route lives at `apps/web/app/api` and returns domain shapes.

| | |
|---|---|
| `POST /api/plan/draft` | Turn answers into a plan. Writes nothing. Returns the plan plus an opaque blob for the person to approve |
| `POST /api/plan/approve` | Record that a plan went live. Reads the chain rather than trusting the caller |
| `GET /api/plan` | The live plan |
| `GET /api/plan/status` | On plan, drifting, or off plan |
| `POST /api/plan/compare` | "What if?" — rebuilds the plan under a changed assumption |
| `GET /api/money` | What the person has now |
| `GET /api/money/wallet` | What they hold outside the plan |
| `POST /api/money/funding-plan` | How to add an amount, split by the plan's targets, with shortfalls |
| `POST /api/money/confirm` | Record a step that settled, after checking the receipt on-chain |
| `GET /api/progress` | Whether they will get there |
| `GET /api/adjustment` | What Modalis suggests, already checked against the rules |
| `POST /api/adjustment/execute` | Carry it out |
| `GET /api/activity` | What has happened |
| `GET /api/status` | What this deployment can do |
| `POST /api/demo/scenario` | A controlled market movement, for the demonstration |
| `POST /api/demo/security-test` | Submit a deliberately invalid adjustment and show the refusal |

### Who is asking

Identity comes from one place: a sign-in token verified against the provider's published signing
keys. The verified wallet address in that token is the only account the server will act on.

```ts
const owner = await requireOwner(request);   // a verified session, never the body
const plan  = await getPlan(ctx, owner);     // ownership by construction
```

This closed a real hole. A route used to read `{"owner": "0x…"}` from its body and act on it, so
anyone could make the Modalis manager key work on someone else's plan. The contracts still
protected the money — nothing could be stolen — but it allowed griefing and burned other people's
gas.

Three things keep it closed:

- `packages/auth/test/session.test.ts` — 22 tests against **real** signatures. A token signed with
  the wrong key, expired, unsigned, or issued for a different deployment is refused.
- `apps/web/test/api-ownership.test.ts` — a static audit of every route in the app. A new route
  that changes something without a verified account fails the build, as does any route that reads
  an account from a body, path or query string. Three routes are listed as public, each with the
  reason it discloses nothing and changes nothing.
- A development bypass exists for local work without a sign-in provider. It is refused outright on
  mainnet whatever the environment says, and `/api/status` reports loudly when it is on.

**Authentication does not replace the contract's enforcement.** It answers "who is asking". The
mandate still answers "is this allowed", and it is the final authority.

## Adding money

Adding money is a product flow, not a button that calls a contract.

1. The person says how much.
2. The **server** works out what should happen: it splits the amount across investments by the
   plan's own targets, converts to units at live prices, and checks they actually hold enough.
3. The person walks the steps. Each investment needs permission, then the transfer — shown as
   progress, not as jargon.
4. Each step is signed by **their own account**. The server records it only after checking the
   receipt on-chain, and refuses a receipt sent by anyone else.

That split is the security model, not a convenience. The worst a compromised Modalis server could
do here is propose a bad funding plan, which the person would still have to approve step by step
while seeing each amount. No Modalis key can add money, for the same reason none can remove it.

A shortfall is reported before anything is signed, so the screen says "you don't have enough
Bitcoin" rather than letting a transaction fail.

## Adjustments

> Modalis **recommends**. The person's **rules** decide. The **contract** enforces.

`GET /api/adjustment` simulates the change against the live contract before returning, so a person
is told whether their rules permit it *before* being asked to approve anything. A refusal comes
back as `allowedByYourRules: false` with the rule named in their own words — "your limit on how
much can sit in one investment" — because that is the system working, not an error.

`POST /api/adjustment/execute` re-derives the proposal from live chain state. A caller cannot pass
a proposal, an amount, a token or a venue; the only thing it gets to say is "act on my plan now".
The contract then re-checks authorisation, plan version, deadline, replay, price protection, venue
and — after the trade — that the result still satisfies every rule. Any failure reverts
everything, so nothing moves.

Three gates, each independent:

1. Is this person signed in, and is this their plan? (`requireOwner`)
2. Do they currently permit Modalis to adjust it? (`plan.adjustmentsEnabled`, read from the chain)
3. Do their rules allow this specific change? (the contract, which is the one that counts)

## Activity, including what was refused

Activity merges two sources, and the difference matters.

- The **chain** records everything that succeeded. It cannot record what was refused, because a
  refused action reverts and emits nothing.
- The **database** records what Modalis suggested, including the suggestions the rules turned
  down. That record exists nowhere else.

So a complete history needs both, and the response says which halves answered rather than implying
a single omniscient log. Showing the refusals is the point: it is the moment a person's limits did
their job, and leaving it out would hide the best evidence that the product works as described.

## Testing the boundary

| | |
|---|---|
| `packages/domain/test/terms.test.ts` | Sweeps every user-facing sentence in the domain layer for protocol vocabulary. Verified against a planted leak |
| `packages/domain/test/money.test.ts` | The funding split, exact integer amounts, permission ordering, shortfalls, refusals |
| `packages/domain/test/plan.test.ts` | A plan reads back in product terms; progress promises nothing |
| `packages/domain/test/adjustments.test.ts` | Both answers — permitted and refused — and that a refusal moves nothing |
| `packages/domain/test/fake-chain.ts` | A fake Monad that answers the same reads, so the services run their real code paths |
| `packages/auth/test/session.test.ts` | Real signatures, real JWKS, real refusals |
| `apps/web/test/api-ownership.test.ts` | Every route audited for ownership |

What the fake chain deliberately does **not** fake is enforcement. Whether a given adjustment is
permitted is decided by `PortfolioMandate` in Solidity, and that is tested where it belongs:
against a real EVM in `contracts/test/` (47 tests) and end to end in `scripts/demo-local.sh`,
which submits a deliberately invalid adjustment for real and shows it reverting on-chain.
