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

The evidence test caught a real defect during this pass: an unknown balance was reported as
"$0". Unknown now makes no claim.

## Not built — in dependency order

Each of these needs the one above it. None is started, and none is claimed.

1. **Multi-goal accounting (§5, §6)** — the contracts hold one mandate per owner. Several goals
   over one portfolio need internal accounting in the database first; priority (§6) and the
   contribution router (§7) both depend on it.
2. **Contribution router (§7)** — fund the most under-target holding first instead of splitting
   by target. Small change to `buildFundingPlan`; worth doing before multi-goal.
3. **Glide paths (§8)** — needs plan versioning (§14) so a scheduled risk change is a new version
   the person approved, not a silent mutation.
4. **Plan versioning (§14)** — `plan.version` exists on-chain; the database needs `plan_versions`.
5. **Withdrawal planner (§23)** — today withdrawal is the owner's emergency exit. A partial,
   goal-aware withdrawal needs a contract path and the goal impact maths (which exists).
6. **Exposure graph, asset & strategy registries (§11–13)** — the on-chain `AssetRegistry` covers
   the asset half; strategies are currently derived by `packages/ai` and would move to a registry.
7. **Notifications + domain events (§36, §37)** — events exist on-chain and in the indexer; a
   notification table and delivery are not built.
8. **Automation levels (§33)** — today is "Assisted": Modalis prepares, the person approves.
   "Automated" needs the timelock work (§18) first.
9. **Observability (§49)** — not built.

## Deliberately not done

- No language model generates any financial statement. §31 allows one for explanation; the
  evidence engine is built so a model can only reword its output, never source it.
- No package was created for its own sake (§53). `health.ts` and `answers.ts` live in the domain
  package because that is the product language.
