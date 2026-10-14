# Modalis Twin

Modalis Twin is the read-only branch of the product. It answers “what if I changed my deadline,
target, contribution, withdrawal or risk preference?” against the live portfolio balance, without
writing to Monad. A person can name and save as many plan drafts as they need, duplicate and
compare each with the current plan, then review one owner-signed mandate update and choose it.

## Flow

1. `GET /api/twin` reads the approved plan and target allocation, then creates a starter
   alternative. It tries to read the live balance; if a price quote is stale, it keeps the
   exploration available and labels the comparison as using the saved starting amount.
2. `POST /api/twin/simulate` recalculates the alternative on the server. The browser never sends a
   trusted result back for financial decisions.
3. `POST /api/twin/save` stores the named draft in the existing `scenarios` table. Persistence is
   optional and never replaces chain state. Saved drafts are returned by `GET /api/twin` and
   `/api/plans`, so the UI can reopen, duplicate and compare multiple plans without recreating
   them.
4. `POST /api/twin/prepare` derives the exact `setMandate` parameters and existing allocation
   ranges. It refuses a risk profile that the current allocation cannot satisfy, before a wallet
   prompt appears.
5. The owner's wallet signs `setMandate` in the browser. This updates the target/date and signed
   guardrails; it does not deposit, withdraw or trade funds.
6. `POST /api/twin/approve` verifies the receipt came from the owner, went to the deployed mandate
   contract, decoded as `setMandate`, matched the selected branch, and produced a live target.
   It records the mandate version, goal update, scenario selection and receipt in the existing
   history services.

## Deterministic calculation

`packages/domain/src/twin.ts` uses integer USD 1e18 arithmetic. Each month applies a fixed annual
path and then adds the monthly contribution. The three paths are downside, expected and upside;
the built-in cautious, balanced and adventurous profiles are explicit constants in source. “Goal
confidence” is a transparent 25%/50%/25% weighting of the three paths that reach the target. It is
an educational comparison, not a market probability or a return promise. Fees, taxes, trading
costs and unentered deposits or withdrawals are excluded.

The simulator validates target, timeline, contribution and withdrawal bounds before calculation.
An invalid withdrawal throws before any input can be mutated, and the domain test covers that
property. The existing `PortfolioMandate` contract remains the final authority after signing.

## Local validation

```bash
pnpm --filter @modalis/domain test
pnpm --filter @modalis/domain typecheck
pnpm --filter @modalis/web typecheck
pnpm --filter @modalis/web build
```

Open `/app/scenarios` after signing in to a plan. If the current oracle is stale, the app reports
the limitation and uses the plan's saved starting amount for read-only exploration; it never
fabricates a live balance. One approved Monad policy can fund several goals in priority order. The
overview shows that active plan beside saved alternatives. The contract intentionally has one
active policy per wallet: multiple drafts can exist safely, but only the plan the owner signs
becomes live. Use `/app/goals` to add, reorder and review those goals; Twin branches remain
separate from goal bookkeeping until an owner explicitly approves a plan update. The exact Ubuntu
WSL setup and Vercel deployment steps remain in
[`wsl-commands.md`](wsl-commands.md) and [`deployment.md`](deployment.md).
