# Envio HyperIndex — portfolio history

Indexes Modalis' on-chain history so the application never reconstructs a portfolio's past from
RPC. The dashboard's activity and mandate-history views read this; live state still comes straight
from the contracts.

## What is indexed

| Contract | Events |
|---|---|
| `PortfolioMandate` | `MandateUpdated`, `AllocationSet`, `MandateActiveSet`, `ManagerSet` |
| `PortfolioVault` | `Deposited`, `Withdrawn`, `TradeSettled`, `EmergencyWithdrawn` |
| `RebalanceExecutor` | `Rebalanced`, `AllocationSnapshot` |
| `RiskSignalReceiver` | `RiskStateUpdated`, `RebalanceRequired` |

Entities: `User`, `Mandate`, `MandateAllocation`, `Position`, `Transaction`, `Rebalance`,
`RiskEvent`, `GoalSnapshot`.

## Design notes worth knowing

- **ABIs are generated, not transcribed.** `abis/*.json` come from the compiled Foundry artifacts
  via `pnpm --filter @modalis/chain sync-abis`. The indexer, the app and the deployed bytecode
  therefore cannot disagree. Do not hand-edit them.
- **Mandates are versioned and immutable.** A policy change writes a new `Mandate` row rather than
  mutating the old one, which is what makes "what changed between v2 and v3?" answerable from the
  index instead of guessed.
- **Only successful rebalances appear here.** A proposal the mandate rejects reverts the whole
  transaction, so it emits nothing — the absence of a row *is* the record that the mandate held.
  Rejected proposals are surfaced from the application database, where they are stored with their
  revert reason; conflating the two would misrepresent chain history.
- **`reasonHash` ties prose to chain.** Each rebalance stores `keccak256` of the explanation shown
  to the user, so the stored text can be verified against what was committed on-chain.
- **Handlers assume no log ordering.** `AllocationSnapshot` and `Rebalanced` arrive in the same
  transaction; whichever lands first creates the row and the other completes it.
- **`rollback_on_reorg` is on.** A reorged-away rebalance must not linger in someone's financial
  history. Event rows are keyed by `txHash + logIndex` so a replay overwrites rather than
  duplicates.
- **On-chain only.** Goals, interview answers and AI explanations are not here — they were never
  on-chain. They live in `supabase/migrations`, and keeping the split clean is what makes this
  half auditable.

## Verification status

**Verified by execution:**

- `config.yaml` validates against **Envio's own `evm.schema.json`**, taken from the installed
  `envio` package rather than from memory:

  ```bash
  pnpm --filter @modalis/envio validate
  ```

  The same check also asserts every event named in the config actually exists in the generated
  ABI, and that every chain-level contract reference resolves. That catches a typo'd event name
  without needing Docker, Postgres or a network.
- Handlers are written against the real HyperIndex 3.x API (`indexer.onEvent`,
  `context.<Entity>.set/get/getWhere`), read from the installed package's `index.d.ts`.

**Not verified here, and why:** `envio codegen` / `envio dev` need Docker and Postgres, which this
build environment does not have, so the generated types have not been compiled and the indexer has
not been run against a live chain. Run the three commands below before relying on it.

## Running it

```bash
# addresses and start block come from the deploy script's output
export NEXT_PUBLIC_PORTFOLIO_MANDATE_ADDRESS=0x...
export NEXT_PUBLIC_PORTFOLIO_VAULT_ADDRESS=0x...
export NEXT_PUBLIC_REBALANCE_EXECUTOR_ADDRESS=0x...
export NEXT_PUBLIC_RISK_SIGNAL_RECEIVER_ADDRESS=0x...
export MONAD_TESTNET_RPC_URL=https://monad-testnet.g.alchemy.com/v2/<key>
export ENVIO_START_BLOCK=<block of the first deployment>

pnpm --filter @modalis/envio validate   # schema + ABI check, no Docker needed
pnpm --filter @modalis/envio codegen
pnpm --filter @modalis/envio dev        # local indexer + GraphQL at http://localhost:8080
```

Hosted deployment uses `ENVIO_API_TOKEN` and `envio deploy`; set `ENVIO_GRAPHQL_URL` in the web
app afterwards so the activity view reads the indexer instead of falling back to RPC log queries.

`ENVIO_START_BLOCK` should be the block of the first contract deployment. Leaving it at 0 works but
makes the initial sync scan the whole chain.
