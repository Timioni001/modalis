# MODALIS

**Goal-based wealth management, programmed on Monad.**

Tell Modalis what your money needs to accomplish. It builds a portfolio around the goal and
manages it within a financial mandate you approve.

> AI decides what should happen.
> Smart contracts decide what is allowed.
> Monad settles what happens.

---

## The idea

Most people can say what they need their money to do. Far fewer can say which assets to own, how
much risk they can afford, or when to rebalance.

Modalis turns the first into the second — and then makes the result **enforceable**. Your goals
and constraints become a **Portfolio Mandate**: a target and date, a drawdown ceiling, a liquidity
floor, a concentration cap, per-asset ranges, a rebalance threshold and a slippage limit, stored
on Monad as rules a contract checks on every action.

The AI proposes. The mandate decides. You keep withdrawal authority throughout.

```
GOAL → PROFILE → MANDATE → ONCHAIN POLICY → PORTFOLIO
     → MONITORING → BREACH → PROPOSAL → VALIDATION
     → EXECUTION → SETTLEMENT → UPDATED STATE ↺
```

## Quick start

```bash
bash scripts/setup.sh        # Node 22+, pnpm, Foundry, deps, ABIs  (Ubuntu / WSL2)
bash scripts/verify.sh       # everything verifiable offline
bash scripts/demo-local.sh   # the complete loop on a real local chain
```

`scripts/demo-local.sh` runs eleven steps end to end and writes a report with real transaction
hashes to `docs/e2e-run.md`.

To deploy to Monad testnet, fill in `.env` and:

```bash
pnpm contracts:deploy:testnet
```

## Verification status

Stated precisely, because a hackathon README is exactly where overclaiming happens. **Verified by
execution** means a command in this repository runs it and it passes.

### Verified by execution

| | |
|---|---|
| **47 contract tests pass** | mandate enforcement, access control, replay, slippage, pause, emergency exit, Kuru adapter, CRE report decoding |
| **38 TypeScript tests pass** | portfolio engine (9), venue selection (6), intelligence layer (23) |
| **The full loop runs on a real EVM node** | 11/11 steps, 13 real transactions, idempotent across runs |
| **An invalid proposal reverts on-chain** | submitted for real with an explicit gas limit, `MAX_ALLOCATION_EXCEEDED`, portfolio asserted unchanged |
| **The manager key cannot withdraw** | asserted in both the contract tests and the end-to-end run |
| **1,296 interview combinations produce valid mandates** | every generated plan satisfies the contract's own rules |
| **The web app builds and serves the whole flow** | all API routes exercised against live chain state |
| **The CRE report encoding matches its contract** | a payload from the workflow is decoded by `RiskSignalReceiver` in a forge test |
| **The Envio config is schema-valid** | checked against Envio's own `evm.schema.json`, plus every event verified against the ABI |

### Built, but not yet run against the live service

Each needs a credential or network access the build environment did not have. None is claimed as
working in the UI — `/api/status` reports the real state and the landing page renders it.

- **Monad testnet/mainnet deployment.** The deploy script is verified against a real EVM node; it
  has not been pointed at Monad from here. One command when you have an RPC URL and a funded key.
- **Dynamic.** Needs `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. The app renders without it and says
  wallet onboarding is unconfigured.
- **Kuru.** The adapter is tested through the full execution path against a mock router built from
  the real ABI, but not against live markets.
- **Chainlink CRE.** Needs the CRE CLI and `cre login` to simulate or deploy.
- **Envio.** `envio codegen` needs Docker and Postgres.
- **Alchemy.** Needs an API key; falls back to the chain's public RPC.
- **The AI layer.** Needs `AI_API_KEY`. Without it the deterministic pipeline runs and the product
  works end to end — the LLM only reads free-text goals and writes prose.

### Deliberately not built

- **Perpl.** The brief marks it optional and warns against leveraged perps in a goal-based wealth
  product. Nothing in the UI implies it exists.

## What is real and what is simulated

One synthetic input, clearly marked everywhere it appears:

| | |
|---|---|
| **Simulated** | the demo oracle price move that creates the breach, and the demo ERC-20s |
| **Real** | the mandate, the balances, the breach computed from them, the proposal, the contract's decision, the execution, the settlement, and every transaction hash |

No transaction hash in this repository is fabricated. Where a step sent no transaction, it has no
hash. The scenario engine refuses to run on mainnet, and where Kuru is unconfigured the UI labels
the demo adapter "not a venue".

## Architecture

```
apps/web            interview · mandate approval · dashboard · risk · activity · what-if
packages/ai         risk profiler → allocation planner → mandate builder → explanations
packages/portfolio  allocation · drift · concentration · liquidity · rebalance planner
packages/chain      the only place the app talks to Monad (ABIs generated from the artifacts)
packages/execution  venue selection: Kuru, or the demo adapter
services/           risk-monitor (the control loop + scenario engine), demo (the E2E runner)
contracts/          AssetRegistry · PortfolioMandate · PortfolioVault · RebalanceExecutor
                    KuruAdapter · RiskSignalReceiver
integrations/       kuru · chainlink-cre · envio
supabase/           application state (goals, interviews, explanations) with RLS
```

Full detail in [`docs/architecture.md`](docs/architecture.md).

## Security model

Every proposal is checked on-chain for authorisation, mandate active, mandate version (anti-stale),
deadline, nonce (anti-replay), a slippage floor derived from the oracle, an approved venue, and
**post-trade mandate compliance**. Any failure reverts the whole transaction.

| Actor | Can | Cannot |
|---|---|---|
| Owner | set the mandate, deposit, withdraw, revoke, pause | be bypassed |
| Manager (backend key) | call `RebalanceExecutor.execute` | withdraw, change rules, pick an unapproved venue |
| AI layer | propose and explain | hold a key or sign anything |
| Chainlink CRE | publish a risk signal | move funds |

Full detail, including known limitations and a mainnet checklist, in
[`docs/security.md`](docs/security.md).

## Documentation

| | |
|---|---|
| [`docs/architecture.md`](docs/architecture.md) | How the layers fit together and why the allocation is deterministic |
| [`docs/security.md`](docs/security.md) | Authority model, the validation pipeline, limitations, mainnet checklist |
| [`docs/bounty-matrix.md`](docs/bounty-matrix.md) | Each sponsor integration and exactly what is proven |
| [`docs/demo.md`](docs/demo.md) | The three-minute script and answers to the obvious questions |
| [`integrations/kuru/README.md`](integrations/kuru/README.md) | ABI provenance and execution safety |
| [`integrations/chainlink-cre/README.md`](integrations/chainlink-cre/README.md) | The risk workflow and its narrow scope |
| [`integrations/envio/README.md`](integrations/envio/README.md) | Indexed entities and design notes |

## Commands

```bash
pnpm verify              # everything verifiable offline
pnpm demo                # the full loop on a local chain
pnpm dev                 # the web app

pnpm contracts:test      # forge tests
pnpm contracts:build
pnpm contracts:sync-abis # regenerate ABIs for the app and the indexer
pnpm test                # TypeScript package tests
pnpm typecheck

pnpm risk-monitor:once   # evaluate watched portfolios once
pnpm envio:validate      # Envio config against Envio's own schema
```

## Requirements

Node 22+ (the TypeScript runs directly via Node's type stripping), pnpm, Foundry, and Python 3 for
the Envio config check. `scripts/setup.sh` installs what is missing on Ubuntu / WSL2.

## Disclaimer

Prototype and technical demonstration only. Modalis is not an investment adviser, broker, fund or
pooled investment vehicle. Nothing here is financial advice, no return is promised or implied, and
no figure shown is a projection of future performance. Demo tokens exist only on test networks and
are not real investment assets. There has been no security audit — do not put meaningful funds
behind this.
