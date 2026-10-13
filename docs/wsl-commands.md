# Run Modalis on Ubuntu WSL2

Use Ubuntu inside WSL2. Keep the repository in the Linux filesystem, such as `~/modalis`, rather than `/mnt/c`, for reliable filesystem watching and faster builds. This repository is independent of other projects.

## Toolchain

Install Git, curl, Python 3 and build tools, then Node 22 LTS or newer. Use pnpm **10.28.0**, matching `packageManager`; using a different pnpm major can trigger a dependency-layout rebuild.

```bash
sudo apt-get update
sudo apt-get install -y git curl python3 python3-yaml python3-jsonschema build-essential
# Install Node 22 LTS using your usual trusted Node installer.
node --version
corepack enable
corepack prepare pnpm@10.28.0 --activate
cd ~/modalis
bash scripts/setup.sh
```

If your Node distribution has no Corepack, install the matching manager with `npm install -g pnpm@10.28.0`. The setup script installs Foundry, fetches the pinned Solidity libraries, installs locked dependencies, builds contracts and synchronizes ABIs. It creates `.env` from `.env.example` if needed.

## Functional local app: no hosted keys required

Terminal 1:

```bash
cd ~/modalis
bash scripts/demo-local.sh
```

This starts Anvil on `127.0.0.1:8545`, deploys the contracts and runs the complete financial loop. Leave it running. All transactions are real local-EVM transactions; tokens and oracle inputs are test fixtures. The report is `docs/e2e-run.md`.

Terminal 2:

```bash
cd ~/modalis
bash scripts/dev-local.sh
```

Open **http://localhost:3000** from Windows. The header says **Local wallet**. Create a plan, approve it, open Add money, get test money and fund the plan. Try Money, Activity, What if, Ask Modalis, withdrawals, pause/resume and manager revocation. Savings circles are included in new deployments.

The local launcher uses loopback RPC and unlocked Anvil accounts. It skips the root deployment `.env`, so local work does not inherit hosted addresses or credentials. It sets only well-known local test identities; the owner's private key is never sent to the browser. The bypass is refused in production. The local wallet is not evidence of a live Dynamic integration.

When first opening a development route, allow its initial compile to complete. Browser calculations and sign-in SDK code have separate entry points. If development bundling is problematic on your machine, try `bash scripts/dev-local.sh --webpack`.

Without Supabase, chain-backed actions work but named goals, saved contributions, multiple goals, notification history and automation preferences cannot persist. The UI explicitly reports this; it does not invent saved records.

## Saved data and hosted sign-in

For the full saved-data experience, configure a dedicated Supabase project and apply the migrations in `supabase/migrations` in order. Configure the Dynamic environment and allowed origin `http://localhost:3000`, enable EVM/Monad Testnet, and fill the documented variables in the repository `.env`. **Server keys must never use a `NEXT_PUBLIC_` prefix.**

```bash
pnpm dev
```

The root `dev`, `build` and `start` commands load the root `.env` before launching the Next app. Environment variables already supplied by the shell take precedence. Keep `.env` out of Git. For a hosted chain, use matching RPC, contract addresses and wallet network; `/api/status` checks the RPC network and core contract bytecode.

For database security checks that require no hosted credentials:

```bash
sudo apt-get install -y postgresql postgresql-client
pnpm db:local
pnpm db:check
pnpm db:integration
pnpm db:down
```

These use a disposable local Postgres cluster and PostgREST. They are validation tools, not a replacement for a configured hosted Supabase deployment.

## Verify and build

```bash
pnpm test
pnpm typecheck
pnpm contracts:test
pnpm --filter @modalis/risk-monitor test
pnpm --filter @modalis/cre-risk-monitor test
cd integrations/envio
pnpm exec envio codegen --config config.hosted.yaml
pnpm exec tsc --noEmit
cd ../..
pnpm build
pnpm start
```

For the automated browser flow, keep the local chain and development app running in the first two terminals:

```bash
pnpm --filter @modalis/web exec playwright install chromium
pnpm test:e2e
```

This test refuses hosted origins and requires the explicit local-development deployment flag. It signs real local transactions and checks the resulting balances, withdrawal, pause/resume and manager revocation, plus layouts at 320, 390 and 1280 pixels.

`pnpm build` produces the production app. `pnpm start` does not enable the local authentication bypass; production wallet flows require Dynamic configuration.

## Repair expired testnet demo quotes

A demo oracle quote expires after 24 hours. Do not remove this check or use expired prices. With the dedicated oracle-owner key configured and the correct deployment JSON present:

```bash
pnpm prices --refresh --once
PRICE_INTERVAL_SECONDS=21600 pnpm prices --refresh
```

`--refresh` re-publishes the existing synthetic prices without changing their values. Run the continuous refresher in a supervised process, fund its testnet gas, and alert on failures. `pnpm prices` without `--refresh` deliberately simulates market drift. Both modes refuse mainnet.

For deployment and sponsor credentials see `.env.example`, [deployment.md](deployment.md), and [metropolis-research.md](metropolis-research.md). Live Dynamic, Kuru, CRE, Envio and Alchemy validation requires those services; local tests do not certify them.


## Apply the custom savings update

Before deploying to the existing Supabase-backed demo, run `supabase/migrations/0004_savings_preferences.sql` in that project's SQL Editor after migrations 0001–0003. The migration adds a nullable settings column and constraints; existing goals remain valid. Do not run the local reset workflow against a hosted database.

Then install the locked dependencies and run `pnpm test`, `pnpm typecheck` and `pnpm build`. The new `/api/plan/savings` endpoint requires the verified owner's session. Test onboarding → Your limits → Custom savings details, approve, reload Your plan, edit preferences, try an undersized contribution and review an early withdrawal. Personal retrieval reminders allow early withdrawal. The standalone browser test `savings-preferences.spec.ts` requires a local integration database alongside Anvil; it skips honestly when that database is absent.

The local launcher intentionally skips the hosted root `.env`. To exercise persistence in local Anvil mode, pass a dedicated local database's `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` to the shell running `bash scripts/dev-local.sh`. Never point the local authentication bypass at the hosted production database. The anonymous `/demo` preview needs no database.
