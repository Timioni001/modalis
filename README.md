# MODALIS

**Goal-based wealth management, programmed on Monad.**

Tell Modalis what your money needs to accomplish. It builds a portfolio around the goal and manages it within a financial mandate you approve.

> AI decides what should happen.
> Smart contracts decide what is allowed.
> Monad settles what happens.

Prototype / technical demonstration only. Not an investment adviser, broker, or fund. No guaranteed returns. Demo tokens are not real investment assets.

---

## Languages (and why)

| Layer | Language | Why |
|---|---|---|
| Contracts | **Solidity 0.8.28 + Foundry + OpenZeppelin** | Monad is EVM-equivalent; best tooling and audit surface |
| Portfolio engine, web, API, AI layer, CRE workflow, Envio indexer | **TypeScript** | One language across app, CRE (TS SDK), Envio (TS handlers), viem/wagmi |
| Database | **SQL (Postgres on Supabase)** | RLS-protected app state |
| Kuru execution service (optional) | **Python** | Kuru ships a Python SDK suited to a long-running execution worker |

## Layout

```
contracts/    Foundry project: AssetRegistry, PortfolioMandate, PortfolioVault,
              RebalanceExecutor, RiskSignalReceiver (+ demo-only mocks), tests, deploy script
packages/
  portfolio/  Deterministic engine: allocation, drift, risk, mandate-check mirror, rebalance planner
supabase/     migrations/0001_init.sql  (schema + RLS + realtime)
.env.example  Every environment variable, grouped by provider
```

Still to build, in the brief's order: `chain` bindings, Dynamic onboarding, Kuru adapter, CRE workflow, Envio indexer, `ai`, web app, scenario engine.

## Security model

```
AI -> structured proposal -> RebalanceExecutor -> PortfolioMandate.validate -> Vault -> approved adapter
```

- Only the **owner** can set their mandate, withdraw, or emergency-withdraw.
- The **manager** (backend key) can only call `RebalanceExecutor.execute`. It cannot withdraw or edit mandates.
- Every proposal is checked for: authorisation, mandate active, mandate version (anti-stale), deadline, nonce (anti-replay), slippage floor vs oracle, whitelisted venue, and **post-trade mandate compliance** (single-asset cap, per-asset range, liquidity floor). Violations revert the whole transaction.
- Withdrawals and `emergencyWithdraw` keep working while paused.

**Demo security moment:** `test_invalidProposalRevertsMaxAllocationExceeded` submits an action pushing BTC to ~55% against a 40% cap and reverts with `MAX_ALLOCATION_EXCEEDED`.

## Quick start

```bash
# contracts
cd contracts
forge install OpenZeppelin/openzeppelin-contracts foundry-rs/forge-std --no-commit
forge build && forge test -vv

# portfolio engine (Node 22+)
cd ../packages/portfolio && pnpm test

# database
psql "$SUPABASE_DB_URL" -f supabase/migrations/0001_init.sql

# deploy to Monad testnet
cp .env.example .env   # fill in values
cd contracts && forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
```

`forge-std` must be recent enough to include `vm.expectPartialRevert` (v1.9.5+).

## Verification status (read before trusting)

- **Portfolio engine:** 9/9 tests pass (`node --test`).
- **Contracts:** written and hand-reviewed, and the test expectations were replayed against exact integer arithmetic, **but not yet compiled or run with `forge`** (no Foundry in the authoring environment). Run `forge build && forge test` first and fix anything the compiler flags.
- **SQL:** not executed against Postgres. Apply to a fresh Supabase project and check.
- **Needs verification against current docs before use:** Monad `evm_version` and RPC/chain config; CRE report format, forwarder address and `IReceiver` interface (`RiskSignalReceiver`); Dynamic JWT claim name for Supabase RLS (`wallet_address`).
- **Not implemented, deliberately:** the Kuru adapter. Its on-chain interface isn't in the brief and must come from the Kuru SDK/docs; `MockExecutionAdapter` stands in on testnet. Don't ship a fabricated ABI.

## Known limitations (MVP)

- One mandate/portfolio per owner address.
- Deposits are not mandate-checked (only trades are); a deposit can temporarily put the portfolio out of range, which the next rebalance must fix.
- Post-trade check requires the final state to be fully compliant, so a single trade can't be a "partial fix" of an existing breach; the planner finds a full-fix swap or returns null (chain proposals).
- If a mandate update drops an asset the user still holds, that balance stays withdrawable but falls outside validation.
- Prices come from a pluggable `IPriceOracle`; the demo uses an owner-pushed mock. Use a real oracle on mainnet.
