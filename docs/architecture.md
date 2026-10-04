# Architecture

```
                            HUMAN
                              │  a financial goal
                              ▼
┌─────────────────────────────────────────────────────────────────────┐
│  apps/web            goal interview · mandate approval · dashboard  │
│                      risk · activity · what-if · settings           │
└─────────────────────────────┬───────────────────────────────────────┘
                              │
┌─────────────────────────────▼───────────────────────────────────────┐
│  packages/ai         risk profiler → allocation planner → mandate   │
│                      explanations. DETERMINISTIC. The LLM reads     │
│                      free text and writes prose; nothing else.      │
├─────────────────────────────────────────────────────────────────────┤
│  packages/portfolio  allocation · drift · concentration · liquidity │
│                      goal progress · rebalance planner              │
├─────────────────────────────────────────────────────────────────────┤
│  services/risk-monitor   read → assess → plan → quote → SIMULATE    │
│                          → submit.  Proposes; never decides.        │
├─────────────────────────────────────────────────────────────────────┤
│  packages/execution  venue selection: Kuru, or the demo adapter     │
│  packages/chain      the only place the app talks to Monad          │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ a structured proposal
┌─────────────────────────────▼───────────────────────────────────────┐
│                        MONAD  (the security boundary)               │
│                                                                     │
│  RebalanceExecutor   authorise · version · deadline · nonce ·       │
│                      slippage floor · approved venue ·              │
│                      POST-TRADE mandate validation                  │
│  PortfolioMandate    the user's rules, versioned and enforceable    │
│  PortfolioVault      balances; owner-only withdrawal                │
│  AssetRegistry       whitelisted assets, oracles, approved venues   │
│  KuruAdapter         settles through Kuru's orderbook               │
│  RiskSignalReceiver  DON-signed risk state. Signal only.            │
└─────────────────────────────┬───────────────────────────────────────┘
                              │ settled state
              ┌───────────────┴───────────────┐
              ▼                               ▼
     Chainlink CRE                        Envio HyperIndex
     risk monitoring                      portfolio history
```

## The one idea

A Portfolio Mandate is the user's investment policy expressed as rules a contract can enforce:
a target and date, a drawdown ceiling, a liquidity floor, a concentration cap, per-asset ranges,
a rebalance threshold, a slippage ceiling, and who may propose a trade.

Everything else exists to make that enforceable. The AI proposes; the mandate decides.

## Division of responsibility

| Layer | Owns | Explicitly does NOT own |
|---|---|---|
| Human | goals, limits, approval, withdrawal | execution |
| `packages/ai` | profile, allocation, mandate parameters, explanations | authority over funds |
| `services/risk-monitor` | detection, proposals, submission | what is permitted |
| Monad contracts | what is permitted | what *should* happen |
| Chainlink CRE | verified risk state | moving funds |
| Envio | history | live state |

## Why the allocation is deterministic

The planner in `packages/ai/src/allocation.ts` is ordinary portfolio construction: strategic
weights, a glide path that gets more defensive as the goal approaches, concentration caps, and a
liquidity floor. There is no alpha model and the product must never imply one.

It is deterministic for two reasons beyond honesty:

1. **An invalid allocation is a failed transaction.** `buildMandateDraft` refuses to return a
   mandate the chain would reject, so a user is never asked to sign a doomed transaction. A test
   sweeps 1,296 interview combinations and asserts every result satisfies the contract's rules.
2. **Chainlink CRE needs determinism.** The DON reaches consensus only because every node computes
   the same risk state from the same contract reads. The same `assessRisk` runs in the app, in the
   risk monitor and inside the CRE workflow.

## The three-state model

The brief's target / current / transition model is explicit in the code:

- **Target** — `PortfolioMandate.allocationsOf`, the approved weights.
- **Current** — `readPortfolio` in `packages/chain`, valued through `AssetRegistry` so the app
  values the portfolio exactly as the contract does.
- **Transition** — `planRebalance` in `packages/portfolio`: the smallest single swap that returns
  the portfolio to full compliance, or `null` when no single trade can.

That `null` is deliberate. The post-trade check requires the *final* state to satisfy every rule,
so a trade cannot be a partial fix of an existing breach. The planner says so rather than
proposing something the contract would reject.

## Why a proposal is simulated before it is sent

`services/risk-monitor` simulates every proposal against live chain state before submitting. A
proposal the mandate would reject costs no gas and produces a readable reason — the exact custom
error, such as `MAX_ALLOCATION_EXCEEDED` — instead of a failed transaction the user has to
interpret.

The simulation is a convenience, not a control. The contract re-checks everything regardless.

## Money representation

USD is `bigint` scaled by 1e18 everywhere, matching the contracts. Weights are integer basis
points. No float ever touches a monetary value:

- `usdToE18` takes a string for exactness and rounds numbers to 6 dp first, because
  `(0.1).toFixed(18)` is `"0.100000000000000006"`.
- Every bigint crosses the HTTP boundary as a decimal string and is revived with `BigInt`, never
  `Number`, which would silently lose precision above 2^53.
- Venue quotes are advisory. `minAmountOut` is always derived on-chain from the oracle and the
  mandate's `maxSlippageBps`, so a venue can never widen the slippage the user approved.

## ABIs have one source of truth

`packages/chain/scripts/sync-abis.mjs` generates typed ABI modules for the app and bare JSON ABIs
for the Envio indexer, both from the compiled Foundry artifacts. Nothing is hand-transcribed, so
the app, the indexer and the deployed bytecode cannot drift apart.

## Repository layout

```
contracts/          Foundry: the protocol, its tests, and the deploy script
packages/
  chain/            the only place the app talks to Monad
  portfolio/        deterministic portfolio maths
  ai/               profile → allocation → mandate, plus explanations
  execution/        venue selection (Kuru / demo adapter)
services/
  risk-monitor/     the control loop and the scenario engine
  demo/             the end-to-end runner
integrations/
  kuru/             the real Router ABI, vendored with provenance
  chainlink-cre/    the risk-monitoring workflow
  envio/            HyperIndex config, schema and handlers
apps/web/           Next.js app and the server-side API routes
supabase/           application state (goals, interviews, explanations) + RLS
scripts/            setup, verify, demo
```
