# Security model

> AI decides what should happen. Smart contracts decide what is allowed.

The central claim of this project is that the AI is **not** the security boundary. This document
says exactly what enforces that, and which parts are proven by a test you can run.

## Authority

| Actor | Can | Cannot |
|---|---|---|
| **Owner** | set and version their mandate, deposit, withdraw, emergency-withdraw, authorise or revoke a manager, pause their mandate | be bypassed |
| **Manager** (backend key) | call `RebalanceExecutor.execute`, and only that | withdraw, change a mandate, change the asset registry, choose a venue outside the whitelist |
| **AI layer** | produce a structured proposal and an explanation | hold a key, sign anything, emit a contract call |
| **Chainlink CRE** | publish a risk signal | move funds |
| **Protocol owner** | register assets, approve venues, pause | touch user balances |

Every one of these is enforced by `msg.sender` checks on-chain, not by convention in the backend.

## What every proposal is checked against

`RebalanceExecutor.execute` runs this pipeline, and any failure reverts the entire transaction:

1. **Authorisation** — caller is the owner or their authorised manager
2. **Mandate active** — a paused or absent mandate blocks execution
3. **Mandate version** — anti-stale: a proposal built against older rules is refused
4. **Deadline** — expired proposals cannot execute
5. **Nonce** — anti-replay: strictly sequential per owner
6. **Slippage floor** — `minAmountOut` must be no looser than the oracle value less the mandate's
   `maxSlippageBps`, so a compromised manager cannot sandbag a trade
7. **Approved venue** — the adapter must be whitelisted in `AssetRegistry`
8. **Execution** — through `PortfolioVault`, which debits the owner and measures its own balance
   delta rather than trusting the adapter
9. **Post-trade mandate validation** — the *resulting* portfolio must satisfy the single-asset cap,
   every per-asset range, the registry ceiling and the liquidity floor

Step 9 is the one that matters. It is checked **after** the trade settles, against the real
resulting balances, so no proposal can be constructed that passes a pre-check and leaves the
portfolio non-compliant.

## The demonstration

`test_invalidProposalRevertsMaxAllocationExceeded` in `contracts/test/Modalis.t.sol` submits a
well-formed, correctly signed proposal that would push one asset past its cap. It reverts with
`MAX_ALLOCATION_EXCEEDED`.

The end-to-end runner goes further: it submits that proposal **for real**, with an explicit gas
limit so it is actually mined rather than rejected during gas estimation. The result is a real
transaction hash whose receipt shows a revert, and the runner then asserts the portfolio is
byte-for-byte unchanged.

```bash
bash scripts/demo-local.sh     # step 8 of 11
```

The same path is exposed at `POST /api/rebalance/invalid` behind `DEMO_MODE`, and refuses to run
on mainnet.

## Asset and trade safety

- Assets are whitelisted in `AssetRegistry` with a global per-asset ceiling independent of any
  user's mandate.
- Deposits are refused for any token not in the caller's own mandate, so nothing sits outside the
  policy's view.
- `tokenIn == tokenOut` is rejected; zero addresses are rejected.
- Decimals come from the token itself via `IERC20Metadata`, not from configuration.
- Deposits credit the amount actually received, so a fee-on-transfer token cannot over-credit.
- The vault verifies its own balance delta after a swap and reverts on `ADAPTER_OVERSPEND` if an
  adapter spends more than it was approved for.
- Prices come from a pluggable `IPriceOracle` that **reverts on stale data**, so a frozen oracle
  blocks execution rather than permitting a trade at a stale price.

## Execution venue safety

`KuruAdapter` holds an immutable router address — there is no setter, so there is no arbitrary
external call target. Every market in a route must be owner-allowlisted, native-value legs are
rejected, output is taken from the adapter's own measured balance delta rather than the router's
return value, and any unspent input is refunded in the same transaction.

The vault then independently re-measures its own delta. A misbehaving venue cannot corrupt
portfolio accounting.

## Emergency

- `pause()` blocks deposits and trades.
- **Withdrawals and `emergencyWithdraw` keep working while paused.** A pause must never trap a
  user's money, and a test asserts this.
- `emergencyWithdraw` is scoped strictly to `msg.sender`'s own balances.

## AI safety

The AI never receives a private key, withdrawal access, arbitrary call permission, or the ability
to change a mandate or the approved asset set. It produces a structured action; the contract
verifies it.

The LLM specifically is given two jobs, both safe to get wrong: reading a free-text goal into
structured fields, and writing prose explanations from facts the system already computed. Its
output is schema-validated, and on a missing key, an API error, a refusal or a schema mismatch it
returns nothing and the deterministic path is used. **The whole product works with no AI provider
configured.**

Every mandate parameter and every allocation weight that reaches the chain comes from the
deterministic pipeline, which refuses to emit a mandate the contract would reject.

## Key handling

| Key | Lives | Authority |
|---|---|---|
| User's wallet | the user's device, via Dynamic | full ownership of their portfolio |
| `MANAGER_PRIVATE_KEY` | server only | `RebalanceExecutor.execute` and nothing else |
| `ORACLE_UPDATER_PRIVATE_KEY` | server only, testnet only | demo oracle prices; refuses to run on mainnet |
| `DEPLOYER_PRIVATE_KEY` | deployment only | registry admin; transfer to a multisig for mainnet via `Ownable2Step` |

Use a fresh testnet-only key for each. `.env` is gitignored; `.env.example` documents every
variable and marks which are server-only.

## Known limitations

These are real and deliberate; none is hidden in code comments only.

- **One mandate and one portfolio per owner address.** The demo runner generates a fresh user key
  per run for this reason.
- **Deposits are not mandate-checked**, only trades are. A deposit can temporarily put a portfolio
  out of range, which the next rebalance corrects.
- **The post-trade check requires full compliance**, so one trade cannot partially fix an existing
  breach. The planner returns `null` rather than proposing something that would revert.
- **If a mandate update drops an asset the user still holds**, that balance stays withdrawable but
  falls outside validation.
- **The demo oracle is owner-pushed.** Use a real oracle on mainnet; `AssetRegistry.setAssetOracle`
  exists for exactly that.
- **No formal audit.** This is a hackathon prototype. Do not put meaningful funds behind it.

## Mainnet checklist

- [ ] Replace `MockPriceOracle` with a real oracle per asset
- [ ] Deploy `KuruAdapter` with the real router; remove `MockExecutionAdapter`
- [ ] `DEPLOY_DEMO_ASSETS=false`; register real assets
- [ ] `DEMO_MODE=false` (the scenario engine refuses mainnet regardless)
- [ ] Transfer registry, vault and executor ownership to a multisig via `Ownable2Step`
- [ ] Verify the CRE forwarder address for Monad mainnet
- [ ] Re-check `evm_version` against current Monad docs
- [ ] Rotate every key; never reuse a testnet key
