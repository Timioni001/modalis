# Turning on the optional integrations

Every one of these is optional. Without them Modalis still works: it runs chain-only, reads
history from chain logs, and uses the demo trading venue. `/api/status` reports which are on, so
the site never claims an integration it does not have.

Addresses below were **checked on Monad testnet on 12 October 2026** — each one has contract code
at that address. Verify again before a demo; these can move.

```bash
bash scripts/check-env.sh      # what Vercel has now, and what each missing value adds
```

---

## 1. Kuru — the order book (trading track)

Kuru's own contract addresses on Monad testnet, from
[docs.kuru.io](https://docs.kuru.io/contracts/Contract-addresses):

| What | Address |
|---|---|
| Router | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` |
| Kuru Utils | `0xE0841E0F06c5770C1D4930EC6C507ee33199C88C` |
| MON-USDC market | `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9` |
| USDC (Kuru's) | `0x3bA3d39AFcf8bb994f7964B3e0171Ea2Ba361570` |

In `.env.golive`:

```bash
KURU_ROUTER_ADDRESS='0x7EFbE105Ca7415dE98F96622173458ac1c054630'
KURU_MARKET_ADDRESSES='0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9'
```

Then:

```bash
bash scripts/add-integrations.sh      # deploys KuruAdapter against the real router
SKIP_TESTS=1 bash scripts/go-live.sh  # tells the site the new address
```

This deploys `KuruAdapter` pointed at Kuru's real router, allows that market on it, and approves
it as a venue in `AssetRegistry`. It is additive: nothing already deployed changes.

### Do not set `KURU_API_URL` on testnet

`selectVenue` in `packages/execution` routes trades through Kuru only when **both** the adapter
address **and** `KURU_API_URL` are set. Leave `KURU_API_URL` unset and trades keep going through
the demo adapter, which is what you want on testnet, for two reasons:

- Modalis's demo tokens (mUSD, mBTC, mETH, mBOND) are props with **no Kuru market**. Routing them
  to Kuru would mean quoting a pair that does not exist.
- Kuru's API and WebSocket are mainnet-only, so there is no testnet endpoint to point at.

So on testnet the honest claim is: *the adapter is deployed against Kuru's real router and
approved as a venue; order routing goes live on mainnet, where the markets are.* Do not say
trades are executing on Kuru, because they are not.

---

## 2. Chainlink CRE — the risk signal (Chainlink track)

From the
[CRE forwarder directory](https://docs.chain.link/cre/guides/workflow/using-evm-client/forwarder-directory-ts).
Both verified to have code on Monad testnet:

| Which | Address | Use |
|---|---|---|
| **Production** `KeystoneForwarder` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` | A deployed workflow. **Use this one.** |
| Mock forwarder | `0xB9F79d863261869B234c481D1f9A7af84AeAd192` | Only for `cre workflow simulate --broadcast` |

```bash
CRE_FORWARDER_ADDRESS='0xF8344CFd5c43616a4366C34E3EEE75af79a74482'
```

Then `bash scripts/add-integrations.sh`, which deploys `RiskSignalReceiver` pinned to that
forwarder: it accepts a report from that address and from nowhere else.

Confirm the address for your own CRE tenant before relying on it — the directory says addresses
vary by tenant:

```bash
cre workflow supported-chains     # after `cre login`
```

The workflow itself is in `integrations/chainlink-cre`. Put the deployed addresses into
`config.testnet.json` (they are zeros today), then `pnpm cre:simulate` to run it locally.

---

## 3. Envio — indexed history (Envio track)

Envio Cloud deploys from GitHub rather than from your laptop
([docs](https://docs.envio.dev/docs/HyperIndex/hosted-service-deployment)).

1. Sign in at <https://envio.dev> with GitHub.
2. Add an indexer and point it at your repository, branch `claude/awesome-gates-h1pxk0`, root
   directory `integrations/envio`.
3. It builds from `config.hosted.yaml` and `schema.graphql`, and gives you a GraphQL endpoint.
4. Put that endpoint in Vercel:
   ```
   ENVIO_GRAPHQL_URL = https://indexer.dev.hyperindex.xyz/<your-id>/v1/graphql
   ```
5. Redeploy. Activity history and `/api/stats` then come from the indexer instead of chain logs.

Locally first, to check the config is valid:

```bash
pnpm envio:validate
pnpm envio:dev
```

An API key on the endpoint is a paid feature. For a hackathon the open endpoint is fine.

---

## 4. Dynamic — server wallet for "Do it for me"

Two ways to let Modalis carry out adjustments people approve. The second is better, because no
raw private key goes near Vercel.

**A raw key** — make one with `cast wallet new`, fund it at <https://faucet.monad.xyz>:

```bash
MANAGER_PRIVATE_KEY='0x...'
```

**A Dynamic server wallet** (preferred, and it counts for the Dynamic track):

1. <https://app.dynamic.xyz> → Developers → API tokens → make a token. Server wallets must be
   enabled for your environment.
2. ```bash
   DYNAMIC_API_TOKEN='dyn_...'
   pnpm agent:create        # prints DYNAMIC_AGENT_WALLET and the address to fund
   ```
3. Fund the printed address with testnet MON.
4. Put `DYNAMIC_API_TOKEN` and `DYNAMIC_AGENT_WALLET` in `.env.golive` or Vercel.

When both are set they win over `MANAGER_PRIVATE_KEY`. Full steps in `docs/dynamic.md`.

Either way the key is **only** allowed to call `RebalanceExecutor.execute` inside the limits the
person signed. It cannot withdraw, and it cannot change a limit. That is enforced by the
contract, not by this app.

---

## 5. The small ones

**`FAUCET_PRIVATE_KEY`** — worth it before any demo. "Get test money" then works inside the app,
so nobody has to leave for a faucet. Make a key with `cast wallet new`, fund it with MON, and the
app mints demo tokens to new users and tops up 0.05 MON when they have none.

**`AI_API_KEY`** — lets someone type "a house in 5 years" instead of filling the form. An
Anthropic key by default. For an OpenAI-compatible provider, also set `AI_BASE_URL` (for example
`https://api.moonshot.ai/v1`) and `AI_MODEL`. No model ever produces a figure: it only reads the
sentence into the same structured goal the form produces.

**`MONAD_TESTNET_RPC_URL`** — your own endpoint instead of the shared public one. Get one from
Alchemy, QuickNode or dRPC. The public endpoint rate-limits, which is exactly what you do not want
mid-demo.

**`SENTRY_DSN`** — sentry.io → Project settings → Client Keys. Unhandled server errors are
reported with secrets scrubbed.

**`ORACLE_UPDATER_PRIVATE_KEY`** — testnet only. Turns on the live demo buttons ("Simulate a market
move", "Test my rules") and signs `bash scripts/move-prices.sh`. go-live hands the demo price
oracle to this key, so the deployer key never reaches Vercel.

---

## Order worth doing them in

1. `FAUCET_PRIVATE_KEY` and `MONAD_TESTNET_RPC_URL` — these decide whether a judge's first two
   minutes work.
2. `ORACLE_UPDATER_PRIVATE_KEY` — the drift-and-adjust story needs prices that move.
3. Dynamic server wallet — makes "Do it for me" real.
4. `CRE_FORWARDER_ADDRESS` and `KURU_ROUTER_ADDRESS` — one command each, and they are what the
   Chainlink and Kuru tracks ask for.
5. `ENVIO_GRAPHQL_URL` — needs a hosted deploy, so leave it until the rest is working.

After any change: `SKIP_TESTS=1 bash scripts/go-live.sh`, then check
`https://your-site/api/status`.
