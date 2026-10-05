# Sponsor integration matrix

The rule from the brief: **only claim an integration if the product visibly and technically uses
it.** This table says what is built, what is proven by something you can run, and what still needs
credentials or network access this build environment does not have.

`/api/status` reports the same thing at runtime, and the landing page renders it — an unconfigured
integration shows as "Not configured" rather than as a logo.

| Sponsor | What Modalis uses it for | Built | Verified by execution |
|---|---|---|---|
| **Monad** | Portfolio state, mandate enforcement, settlement | Yes | **Yes** — 47 contract tests; full loop run on a real EVM node |
| **Dynamic** | Email / social login, embedded Monad wallet, signing, **and server-side identity** | Yes | Partly — the token verification path is proven with real signatures against a real JWKS; signing in needs an environment id |
| **Kuru** | Orderbook execution venue for rebalances | Yes | Partly — 11 adapter tests through the full executor → vault → adapter → router path; no live market |
| **Chainlink CRE** | DON-signed portfolio risk monitoring | Yes | Partly — report encoding proven against the receiving contract; workflow not simulated |
| **Alchemy** | Monad RPC + WebSocket event streams | Yes | Partly — transports and URL construction built; needs an API key |
| **Envio** | Indexed portfolio and mandate history | Yes | Partly — config validated against Envio's own JSON schema; codegen needs Docker |
| **Supabase** | Goals, answers, explanations, and the adjustments the rules refused | Yes | Partly — schema and row-level security proven against a real local Postgres, 15 adversarial assertions; no hosted project configured |
| **Perpl** | Capped tactical sleeve | **No** | — |

---

## Monad — core, required

Not a deployment target. The product's financial state lives here.

- Five contracts: `AssetRegistry`, `PortfolioMandate`, `PortfolioVault`, `RebalanceExecutor`,
  `RiskSignalReceiver`, plus `KuruAdapter`.
- Chain definitions come from viem's registry (mainnet 143, testnet 10143) rather than
  hand-written endpoints.
- `evm_version = "cancun"` deliberately: Cancun bytecode runs on a Prague chain, not the reverse.

**Proven:** 47 forge tests. The complete loop — goal → mandate → deposit → breach → proposal →
rejection → execution → settlement → updated state — runs against a real EVM node, twice,
idempotently, with 13 real transactions.

```bash
bash scripts/demo-local.sh
```

## Dynamic — required

Email / social login and an embedded Monad wallet, so a first-time user never sees "connect
wallet". External wallets stay supported.

- `DynamicContextProvider` with `EthereumWalletConnectors`, pinned to the configured Monad network
  so a user cannot sign a portfolio action on the wrong chain.
- `isEthereumWallet` + `getWalletClient` bridges Dynamic's wallet to a viem `WalletClient`.
- The user's wallet signs every owner action: `setMandate`, `setManager`, deposit, withdraw,
  revoke, pause, emergency withdraw.

Dynamic is also how the **server** knows who is asking. Every browser call carries the Dynamic
JWT; `packages/auth` verifies it against Dynamic's published signing keys (JWKS) and the verified
wallet address in that token is the only account the server will act on. Both claim shapes Dynamic
emits are supported: a flat `wallet_address` and the `verified_credentials` array.

**Proven:** 22 tests in `packages/auth/test/session.test.ts` sign **real** tokens with a real key
pair and verify them through the real JWKS path, served from a throwaway localhost server. A token
signed with the wrong key, expired, unsigned, or issued for a different environment id is refused.
A separate static audit (`apps/web/test/api-ownership.test.ts`) checks every route in the app takes
its acting account from that verified session and never from a request body, path or query string.

**Dynamic handles wallet UX and identity; it does not handle financial permissions.** Being signed
in grants no authority over any portfolio — the contracts key every action off `msg.sender`, and a
compromised sign-in provider could at most make the manager key act on a plan, never withdraw from
it or change its rules.

*Needs:* `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`. Without it the app renders and says signing in is
unconfigured rather than showing a button that cannot work.

## Kuru — required / high

Modalis is the portfolio manager; Kuru is the execution venue. Modalis does not build an exchange.

The adapter calls the **real** `Router.anyToAnySwap`, transcribed from the Router ABI shipped in
`@kuru-labs/kuru-sdk` 0.0.95 and vendored unmodified at `integrations/kuru/abi/Router.json`.
Routes come from the SDK's own `PathFinder`. **No ABI is invented.**

**Proven:** 11 tests drive the full `RebalanceExecutor → PortfolioVault → KuruAdapter → router`
path against a mock router implementing the real signature, asserting the route round-trips
unchanged into the router's calldata, that post-trade mandate validation still bites, that
unvetted markets are refused, and that a partial fill cannot strand funds.

*Needs:* `KURU_ROUTER_ADDRESS`, `KURU_MARKET_ADDRESSES`, `KURU_API_URL`. `selectVenue` picks Kuru
only when an adapter address, an API URL and an RPC URL are all present, and otherwise names the
missing variable — it never reports Kuru execution without a Kuru adapter to settle through.

See `integrations/kuru/README.md`.

## Chainlink CRE — required / high

A cron workflow reads each portfolio from Monad through the EVM capability, computes its risk
state with the same deterministic engine the app uses, and writes a DON-signed signal to
`RiskSignalReceiver`.

Determinism is the point: identical contract reads with no clocks, randomness or private data mean
every node reaches the same answer, so the published risk state carries consensus rather than our
assertion.

**Scope, deliberately narrow:** this writes a *signal*. `RiskSignalReceiver` holds no balances and
has no reference to the vault or executor; a rebalance still requires a proposal that passes the
executor's validation. Nothing here claims autonomous fund movement.

**Proven:** `contracts/test/RiskSignalReceiver.t.sol` embeds a payload generated by the workflow's
own `encodeRiskReport` and asserts the contract decodes every field. If the workflow's encoding and
the contract's decoding drift apart, that test fails — the only way to catch it without a live DON.

*Needs:* CRE CLI ≥ 1.29.0, `cre login`, and `CRE_FORWARDER_ADDRESS`. The deploy script **skips**
`RiskSignalReceiver` when no forwarder is set rather than pinning it to `address(0)`.

See `integrations/chainlink-cre/README.md`.

## Alchemy — high

Monad RPC and WebSockets, with `fallback` across endpoints and multicall batching so a portfolio
view is one request rather than one per asset. Live event subscriptions back the dashboard's
settlement updates, with historical log queries as the fallback when Envio is absent.

`hasMulticall3` probes for Multicall3 rather than assuming it — Monad has it on both networks, a
bare local node does not, and batching against a missing Multicall3 returns empty data rather than
erroring. That bug was found by running the loop.

*Needs:* `NEXT_PUBLIC_ALCHEMY_API_KEY`. Falls back to the chain's public RPC.

## Envio — high

12 events across 4 contracts indexed into `User`, `Mandate`, `MandateAllocation`, `Position`,
`Transaction`, `Rebalance`, `RiskEvent`, `GoalSnapshot`. The activity view reads the indexer when
configured and says when it is falling back to RPC logs.

Mandates are versioned and immutable, which is what makes the "what changed between v2 and v3?"
view answerable rather than reconstructed. Only successful rebalances appear — a rejected proposal
reverts and emits nothing, so the absence of a row is itself the record that the mandate held.

**Proven:** `config.yaml` validates against Envio's own `evm.schema.json` from the installed
package, and the same check asserts every configured event exists in the generated ABI.

```bash
pnpm envio:validate
```

*Needs:* Docker and Postgres for `envio codegen`; `ENVIO_GRAPHQL_URL` for the app to read it.

See `integrations/envio/README.md`.

## Supabase

The chain holds everything that matters. Supabase holds what it cannot: the goal's name, the
answers a person gave, the explanations written for them, and — the one that matters most — the
adjustments their rules **refused**. A refused adjustment reverts and emits nothing, so that
record exists nowhere else, and `/api/activity` merges both halves and says which answered.

Two clients with deliberately different authority, mirroring the split in the contracts: the
service-role client (server only, bypasses row-level security, writes the rows that mirror
on-chain truth) and the anon client (subject to row-level security, so a person reaches only
their own rows). `packages/db/src/client.ts` throws rather than build a service client in a
browser, because that key is as powerful as the database.

Persistence is additive, never load-bearing: with Supabase unconfigured every repository becomes a
no-op and the product runs chain-only. A failed write is logged and swallowed rather than failing a
request that was otherwise about to succeed.

**Proven:** the schema applies to a real Postgres 16 (13 tables, 7 enums), and
`supabase/local/01_rls_check.sql` runs 15 adversarial assertions as the `authenticated` and `anon`
roles — reading another person's goals or mandates, writing a goal attributed to someone else,
forging a mandate or a transaction row, taking over another wallet by updating your own row, and
reading anything at all with no sign-in. Every one is refused, and each raises on failure so the
script is a real gate rather than a report.
`packages/db/test/degradation.test.ts` adds 7 tests covering tolerated failures, the unconfigured
path, and the service key never being readable from a `NEXT_PUBLIC_` variable.

```bash
bash supabase/scripts/db-local.sh up && bash supabase/scripts/db-local.sh check
```

*Needs:* `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and
`SUPABASE_SERVICE_ROLE_KEY` for a hosted project.

## Perpl — not built

The brief marks this optional and warns against making leveraged perps part of a goal-based
wealth product. It is not integrated, and no part of the UI implies it is.

The mandate would enforce such a sleeve the same way it enforces everything else: a capped
allocation with `maxBps` on a registered asset. That is a design note, not a claim.
