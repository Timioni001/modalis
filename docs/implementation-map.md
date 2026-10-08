# Implementation map

The expansion prompt describes 64 sections. This maps each area against what is actually in the
repository, so the next step is always chosen from facts rather than from the prompt's ambition.

`MODALIS_MASTER_BUILD_BRIEF.md` is not in the repository — it was attached to an early
conversation and never committed. This map is built from the code.

## Already built — reuse, don't rebuild

| Prompt area | Where it lives | State |
|---|---|---|
| Hard financial limits (§15, §16, §41) | `contracts/src/PortfolioMandate.sol`, `RebalanceExecutor.sol` | Enforced on-chain; 47 Foundry tests incl. adversarial |
| Role separation (§16) | owner / manager / executor in the contracts | Manager can propose, cannot withdraw or change limits — tested |
| Oracle safety (§19) | stale-price check in `RebalanceExecutor` | `test_stalePriceBlocksExecution` |
| Execution adapters (§20) | `KuruAdapter.sol`, `MockExecutionAdapter.sol`, `packages/execution` | Kuru real ABI; demo adapter on testnet |
| Policy check before execution (§15, §21) | `packages/domain/services/adjustments.ts` simulates against the live contract | A refused change never reaches a signature |
| Goal engine + projections (§5, §25) | `packages/domain/src/projection.ts`, `services/goal.ts` | Zero-growth, bigint, tested |
| Scenarios (§25, §26) | `projection.ts` `runScenario`, `/app/scenarios` | Closed set of seven questions, same maths as the real goal |
| Funding flow (§7) | `services/money.ts`, `/app/add-money` | Splits by plan targets, owner-signed |
| Activity / timeline (§28) | `/api/activity`, Envio indexer config | Includes refused adjustments |
| Auth + ownership (§38, §39, §40) | `packages/auth`, `apps/web/lib/api.ts`, `test/api-ownership.test.ts` | JWT/JWKS verified; owner never read from the body |
| Idempotency + rate limits (§40) | `apps/web/lib/guard.ts` | Tested |
| Trust boundary UI (§35) | `/app/plan` "What Modalis can and cannot do", on-chain pause | Pause is owner-signed, not a server flag |
| End-to-end loop (§50, §59) | `scripts/demo-local.sh` | 11 steps, 13 real transactions, invalid action rejected |

## Built in this pass

| Prompt area | What | Where |
|---|---|---|
| Portfolio Health Engine (§9) | `healthy / watch / action_required / restricted`, each reason with the two figures it compares | `packages/domain/src/health.ts` |
| Evidence layer (§29, §30) | Answers the product's eight questions from structured facts only; returns its evidence | `packages/domain/src/answers.ts` |
| Ask Modalis | Conversation UI on the evidence engine; no language model in the path | `/app/ask` |
| Trust test | Every figure in every answer must appear in its evidence or inputs | `packages/domain/test/health.test.ts` |

| Contribution router (§7) | New money fills what is below target first; overweight holdings get none, nothing is sold | `packages/domain/src/contributions.ts`, used by `buildFundingPlan` |
| Withdrawal impact + lump sum (§23, §25) | "What if I take out $500?" answers how much later the goal arrives, from the same projection the goal uses | `projection.ts` scenarios `withdraw`, `add_lump_sum` |

The evidence test caught a real defect during this pass: an unknown balance was reported as
"$0". Unknown now makes no claim.

## Built in the multi-goal pass

Schema in `supabase/migrations/0002_goals_events_automation.sql`. Its row-level security is
checked against real Postgres (`pnpm db:check`), and the whole database path runs end to end through
real PostgREST (`pnpm db:integration`).

| Prompt area | What | Where |
|---|---|---|
| Multi-goal accounting + priority (§5, §6) | Goals rank by priority. The first is funded to its target before the next gets anything, and the rest is surplus. Reordering needs the person's full list. The plan's own goal can't have its target, date or status changed outside a plan change | `packages/domain/src/goals.ts`, `services/goals.ts`, `/api/goals*`, `/app/goals` |
| Plan versioning (§14) | Every approval is a version with its reason, receipt and a plain-language diff ("Kept available: 30% → 40%"). A re-approval updates the same goal and never duplicates it | `services/history.ts`, `/api/plan/history`, plan page |
| Glide paths (§8) | One `GLIDE_PATH` sets the liquidity floor and the growth ceiling by time left. Planner and health engine share it, and health raises `glide_step_due` | `packages/ai/src/glide.ts`, `health.ts` |
| Partial withdrawal (§23, §24) | Over-target holdings are drawn first, then proportionally, for the exact total. Before signing, the person sees which goal it comes from, the delay, and the floor. Uses the vault's existing owner-only `withdraw(token, amount)`, so no contract change was needed | `withdrawals.ts`, `services/withdraw.ts`, `/app/withdraw` |
| Asset & strategy registries, exposure (§11–13) | `ASSETS` and `STRATEGIES` are the single sources. A test proves the limits are unchanged. Exposure shows risks, kinds, investments and venues | `assets.ts`, `packages/ai/src/strategies.ts`, `exposure.ts`, money page |
| Domain events + notifications (§36, §37) | Recorded only by the server after a confirmed receipt. Events are idempotent per transaction, with one notification per event. Milestones (25/50/75/100%) are announced once | `services/events.ts`, `/api/notifications*`, nav bell |
| Automation levels (§18, §33) | Suggest only / Ask me first (default) / Do it for me. Raising waits 24 hours and lowering is immediate. The database grants no write policy, so the browser can't skip the timelock. The contract's limits still apply at every level | `automation.ts`, `services/automation.ts`, settings |
| Monitor consent | The risk monitor runs an adjustment automatically only with both the operator's switch and the person's own "Do it for me". It records each finding, with a 12-hour quiet window | `services/risk-monitor/src/consent.ts` |
| Observability (§49) | Structured logs with secret scrubbing, plus counters and timings on every route. `/api/ops/metrics` is behind a bearer token and returns 404 otherwise | `apps/web/lib/observe.ts` |

Fixed along the way:
- Re-approving a plan created a duplicate goal.
- The 500 path logged raw errors that can carry the RPC URL and its key.
- The monitor's global auto-execute ignored the person's own choice.

## Still open

- **Contracts on Monad testnet (#26).** This needs a funded deployer key from the owner. Everything
  above runs against a local chain until then.

## Deliberately not done

- No language model generates any financial statement. §31 allows one for explanation; the
  evidence engine is built so a model can only reword its output, never source it.
- No separate policy engine (§15). Plan drafts are already validated against hard rules by
  `validateMandateDraft` in `packages/ai`, and every adjustment is simulated against the live
  contract before it can be signed. A third copy of the same rules would be a place for them to
  disagree.
- No package was created for its own sake (§53). `health.ts` and `answers.ts` live in the domain
  package because that is the product language.
