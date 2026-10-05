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

```bash
# From the repository root. Vercel reads vercel.json for the workspace build.
npx vercel --prod
```

Set the root directory to the repository root, not `apps/web` — the build needs the workspace
packages, which live above it.

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
