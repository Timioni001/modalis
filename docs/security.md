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

## Who is asking

The table above answers *what is allowed*. The server has to answer a different question first:
*whose plan is this?*

Identity comes from one place — a sign-in token verified against the provider's published signing
keys — and the verified wallet address in that token is the only account the server will act on.

```ts
const owner = await requireOwner(request);   // a verified session, never the request body
```

### The hole this closed

A route used to read `{"owner": "0x…"}` from its body and act on it. The contracts still protected
the money — the manager key cannot withdraw, and the mandate refuses anything outside its rules —
but anyone could make the Modalis manager key work on a stranger's plan: griefing, and spending
someone else's gas. Authentication was the missing layer, not a replacement for the contracts.

### What keeps it closed

| | |
|---|---|
| `packages/auth/test/session.test.ts` | 22 tests against **real** signatures and a real JWKS fetch. A token signed with the wrong key, expired, unsigned, or issued for a different deployment is refused. `peekToken` decodes without verifying and is tested to prove it is never used for an access decision |
| `apps/web/test/api-ownership.test.ts` | A static audit over **every** route. A route that changes something without a verified account fails the build; so does one that reads an account from a body, path or query string. Verified by planting both regressions |
| The public-route list | Three routes may be called without signing in, each listed with the reason it discloses nothing and changes nothing: `/api/status`, `/api/plan/draft`, `/api/plan/compare` |
| The development bypass | A header-named account for local work without a sign-in provider. Refused outright on chain 143 whatever the environment says, and `/api/status` reports loudly when it is on |

Three independent gates stand between a request and a person's money:

1. Is this person signed in, and is this their plan? — `requireOwner`
2. Do they currently permit Modalis to adjust it? — `plan.adjustmentsEnabled`, read from the chain
3. Do their rules allow this specific change? — the contract, which is the one that counts

Removing any of the first two is a bug. Removing the third would be removing the product.

## Adding money is an owner action

The server works out **what** should happen — the split by the plan's targets, the conversion at
live prices, the check that the person holds enough. The person's **own account** does it, signing
each step.

No Modalis key can put money in, for the same reason none can take it out. The worst a compromised
server could do is propose a bad funding plan, which the person would still have to approve step
by step while seeing each amount. `/api/money/confirm` re-reads the receipt on-chain before
recording anything and refuses a receipt whose sender is not the person asking, so a deposit
cannot be claimed by posting a hash.

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

The same path is exposed at `POST /api/demo/security-test` behind `DEMO_MODE`. It is authenticated
and owner-scoped like every other action, so it can only ever be run against the signed-in
person's own plan, and it refuses to run on mainnet.

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
| Sign-in signing keys | the provider's, fetched over JWKS | nothing: the server only verifies |
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
- **Sign-in trusts the provider.** A compromised sign-in provider could mint a token for an
  address it does not control. That buys an attacker the ability to make the manager key act on
  that plan — it does not buy the money, because withdrawal and rule changes are owner-only
  on-chain and the mandate still refuses anything outside its rules.
- **Persistence is best-effort by design.** A failed database write is logged and swallowed rather
  than failing a request that was otherwise about to succeed, because the chain is the source of
  truth for everything that matters. The visible cost is that the record of refused adjustments
  can have gaps — `/api/activity` says so rather than implying a complete log.
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
- [ ] `MODALIS_DEV_AUTH` unset (it is refused on chain 143 regardless) and `/api/status` showing
      `developmentBypassEnabled: false`
- [ ] `DYNAMIC_JWKS_URL` or `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` set, so sign-in is verified
      rather than unconfigured
- [ ] Supabase row-level security applied, and the service-role key present only server-side
