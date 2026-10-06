# Deploying Modalis

## Vercel, not Cloudflare

**Deploy this on Vercel.** The recommendation is not a preference — Modalis uses four things the
Cloudflare Workers runtime does not provide, and working around them would mean changing the
product rather than the host.

| What Modalis does | On Vercel | On Cloudflare Workers |
|---|---|---|
| Reads `contracts/deployments/<chainId>.json` from disk at request time (`node:fs`) | Works; `outputFileTracingIncludes` carries the file into the function | No filesystem. The deployment record would have to move entirely into environment variables |
| Holds the manager key in a long-lived Node process | Works | Possible, but every value must come from the Workers secret store |
| `jose` + `createRemoteJWKSet`, which caches and rotates signing keys in process memory | Works | Workers isolates are evicted unpredictably, so the JWKS would be refetched far more often |
| Next.js 16 with Turbopack, pnpm workspaces, `transpilePackages` over nine TypeScript packages | First-party | Needs `@opennextjs/cloudflare`, `nodejs_compat`, and a build adapter that lags Next releases |

Cloudflare is excellent at what it is for. This application is a stateful Node server that reads a
chain and holds a signing key, which is the shape Vercel is built around.

**If you must use Cloudflare**, the blocking change is the filesystem read in
`apps/web/lib/server.ts`: set every contract address through environment variables so
`deploymentFromEnv` is fully satisfied and the file is never consulted. The rest follows from
`@opennextjs/cloudflare` with `nodejs_compat` enabled.

## Deploying

**There is exactly one setting to get right: set the project's Root Directory to `apps/web`.**

Vercel detects a framework by looking for it in the `package.json` of the root directory. The
repository root has no `next` dependency — it is a pnpm workspace whose root package only holds
scripts — so pointing Vercel at the repository root makes the build fail with:

```
Error: No Next.js version detected. Make sure your package.json has "next"
in either "dependencies" or "devDependencies".
```

That is what a root-level `vercel.json` with `"framework": "nextjs"` produces, and it is not
fixable from inside the repository: forcing the framework does not create the dependency Vercel is
looking for. `apps/web/package.json` does have `next`, so pointing the root directory there lets
detection work normally.

**In the Vercel project:**

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Include files outside the root directory | **On** (default) — the workspace packages live above it |
| Framework | Next.js (detected automatically) |
| Install / build / output commands | Leave as detected |

Vercel sees the pnpm workspace and installs from the repository root on its own, so the workspace
packages resolve. `apps/web/vercel.json` carries only the region and the API cache headers.

```bash
npx vercel --prod
```

## The contract addresses are not in the repository

`contracts/deployments/<chainId>.json` is gitignored, so a hosted build never sees it. That is
deliberate: the file currently in a local checkout holds **local anvil addresses**, and committing
those would point a hosted deployment at contracts that do not exist on Monad.

So a fresh deployment reports "Modalis isn't set up on this network" until the contracts are
deployed to Monad and their addresses are set as environment variables. `/api/status` says so
plainly rather than failing at the point of use.

### Putting it on Monad testnet

```bash
# A key that exists only for this testnet. Never one that holds anything on a live network.
cast wallet new
# Fund its address at https://faucet.monad.xyz, then:
DEPLOYER_PRIVATE_KEY=0x... bash scripts/deploy-testnet.sh
```

The script checks the key has gas, deploys the protocol, writes
`contracts/deployments/10143.json`, and prints the exact `NEXT_PUBLIC_*_ADDRESS` lines to paste
into Vercel. It never writes, prints or commits the key itself.

`packages/chain` reads addresses from the environment **first** and falls back to the file only
when a variable is absent, so a hosted build is configured entirely by those variables and the
gitignored file is never needed there.

Deploying again produces new contracts and new addresses. Anyone whose plan was on the old ones
will not see it on the new ones, so redeploy only when the contracts themselves changed.

## Environment variables

Nothing below is required for the site to build. Each one that is missing turns a capability off
and `/api/status` reports it as unconfigured rather than failing at the point of use.

### Public — compiled into the browser bundle

| Variable | Effect when absent |
|---|---|
| `NEXT_PUBLIC_SITE_URL` | Share cards and the sitemap fall back to the Vercel URL |
| `NEXT_PUBLIC_MONAD_CHAIN_ID` | Defaults to `10143` (testnet). **Never defaults to mainnet.** |
| `NEXT_PUBLIC_MONAD_RPC_URL` | Falls back to the chain's public endpoint |
| `NEXT_PUBLIC_MONAD_EXPLORER_URL` | Receipts render as plain text instead of links |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | Nobody can sign in; the app says so |
| `NEXT_PUBLIC_ALCHEMY_API_KEY` | Uses the public RPC |
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Goals and history aren't saved |

### Server-only — never prefixed `NEXT_PUBLIC_`

| Variable | Effect when absent |
|---|---|
| `MANAGER_PRIVATE_KEY` | Modalis can't carry out adjustments. It can still recommend them |
| `SUPABASE_SERVICE_ROLE_KEY` | Nothing is persisted. The product runs chain-only |
| `DYNAMIC_JWKS_URL` | Derived from the environment id; set it only to override |
| `AI_API_KEY` | Free-text goals fall back to the form; the deterministic pipeline is unaffected |
| `ENVIO_GRAPHQL_URL` | Activity is read from chain logs instead of the indexer |
| `MODALIS_RPC_URL` | Server-side RPC override, for pointing a deployment at a local node |

### Never set in production

| Variable | Why |
|---|---|
| `MODALIS_DEV_AUTH` | Accepts a header instead of a real sign-in. Refused outright on chain 143, and `/api/status` reports loudly whenever it is on |
| `DEMO_MODE` | Exposes the scenario and security-test endpoints. Both refuse to run on mainnet regardless |
| `ORACLE_UPDATER_PRIVATE_KEY` | Only used by the demo oracle, which never runs on mainnet |
| `DEPLOYER_PRIVATE_KEY` | Deployment only. It should never reach a web host |

## Before pointing this at real money

Everything in the mainnet checklist in [`security.md`](security.md), plus:

- [ ] `NEXT_PUBLIC_MONAD_CHAIN_ID=143` set deliberately rather than inherited
- [ ] `MODALIS_DEV_AUTH` and `DEMO_MODE` absent, confirmed by reading `/api/status`
- [ ] A sign-in provider configured, so `signIn.configured` is true
- [ ] The manager key rotated and never reused from a test deployment
- [ ] Supabase row-level security applied — `pnpm db:check` passes against the hosted project
