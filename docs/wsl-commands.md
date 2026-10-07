# Running Modalis from Ubuntu/WSL

Every command here is run from inside WSL, from the repository root, unless it says otherwise.

```bash
cd ~/modalis          # wherever you cloned it
```

---

## 0. One time, on a fresh machine

Modalis runs TypeScript directly through Node's type stripping, which needs **Node 22 or newer**.
Node 20 will fail with `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` and nothing will make it work.

```bash
# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v                                    # must print v22.x or higher

# pnpm
corepack enable
corepack prepare pnpm@latest --activate

# Foundry (anvil, forge, cast)
curl -L https://foundry.paradigm.xyz | bash
echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.bashrc
source ~/.bashrc
foundryup
```

Then let the setup script do the rest. It is safe to re-run — every step checks before installing.

```bash
bash scripts/setup.sh
```

That installs workspace dependencies, clones forge-std and OpenZeppelin into `contracts/lib/`,
builds the contracts, generates ABIs, and copies `.env.example` to `.env`.

---

## 1. Check everything works, offline

```bash
bash scripts/verify.sh
```

Builds the contracts, runs all 47 Solidity tests and all 170 Node tests, typechecks twelve
packages, validates the Envio config against Envio's own JSON schema, and does a production build
of the web app. It exits non-zero if anything fails, so it also works as a CI gate.

Individual pieces, when you only want one:

```bash
pnpm test                    # Node tests across packages + the web app
pnpm typecheck               # every package
pnpm contracts:test          # Solidity only
pnpm contracts:build
cd apps/web && npx next build
```

---

## 2. Run the whole financial loop against a local chain

```bash
bash scripts/demo-local.sh
```

Starts anvil on `127.0.0.1:8545` with chain id 10143, deploys the protocol, then runs eleven
steps: goal → plan → deposit → a controlled price move → breach detected → adjustment proposed →
**a deliberately invalid proposal rejected by the contract** → the valid one executed and settled →
state back inside the limits → the manager key proven unable to withdraw.

Every transaction is real and every hash comes from the node. The only synthetic input is the demo
oracle price move that creates the breach. The report is written to `docs/e2e-run.md`.

anvil stays up afterwards so you can click through the same chain. `KEEP_ANVIL=false` exits as
soon as the loop finishes.

---

## 3. Run the web app

### Against the local chain

In a **second** WSL terminal, with `demo-local.sh` still running in the first:

```bash
cd ~/modalis
MODALIS_RPC_URL=http://127.0.0.1:8545 \
NEXT_PUBLIC_MONAD_CHAIN_ID=10143 \
DEMO_MODE=true NEXT_PUBLIC_DEMO_MODE=true \
pnpm dev
```

Open http://localhost:3000.

The public site, the hero calculator and the five onboarding steps all work with nothing else
configured. To get past the sign-in gate you need a Dynamic environment id — see below.

### Just the site, nothing else

```bash
pnpm dev
```

Everything behind sign-in will say so plainly rather than pretending to work.

---

## 4. Sign-in (needed to see the app screens)

Free account at <https://app.dynamic.xyz> → Developers → SDK & API Keys. Create
`apps/web/.env.local`:

```bash
cat > apps/web/.env.local <<'EOF'
NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=your-environment-id-here
NEXT_PUBLIC_MONAD_CHAIN_ID=10143
EOF
```

In the Dynamic dashboard, enable **EVM** and add Monad testnet (chain id `10143`) as a network.

`.env.local` is gitignored. Nothing in it is a secret — `NEXT_PUBLIC_` values ship to the browser
by definition — but keep server keys out of it anyway.

---

## 5. Put it on Monad testnet

### Deploy

```bash
# A key that exists ONLY for this testnet. Never one that holds anything real.
cast wallet new
```

That prints an address and a private key. Fund the **address** at <https://faucet.monad.xyz>,
then:

```bash
DEPLOYER_PRIVATE_KEY=0xyour_key_here bash scripts/deploy-testnet.sh
```

It checks the key has gas before touching anything, deploys, writes
`contracts/deployments/10143.json`, and prints the exact `NEXT_PUBLIC_*_ADDRESS` lines to paste
into Vercel. It never writes, prints or commits the key.

Deploying again makes *new* contracts at *new* addresses. Anyone whose plan was on the old ones
will not see it on the new ones, so only redeploy when the contracts themselves changed.

### Get demo tokens so you can actually add money

The demo tokens are testnet props with an open mint. Without them, "Add money" correctly reports a
shortfall and stops — which is right, but it means a fresh wallet can't test anything downstream.

```bash
# The address under Settings -> Your account in the app
DEPLOYER_PRIVATE_KEY=0xyour_key_here \
  bash scripts/fund-wallet.sh 0xYourWalletAddress
```

Mints 10,000 mUSD, 0.2 mBTC, 4 mETH and 100 mBOND — about $35,000 of demo value at the oracle's
opening prices. They are worth nothing and the app says so.

Locally, against anvil, the deployer key is optional:

```bash
MODALIS_RPC_URL=http://127.0.0.1:8545 \
  bash scripts/fund-wallet.sh 0xYourWalletAddress
```

### Then run the app against testnet

```bash
NEXT_PUBLIC_MONAD_CHAIN_ID=10143 pnpm dev
```

`contracts/deployments/10143.json` now holds the testnet addresses, so the app finds them with no
further configuration.

---

## 6. Deploy the site to Vercel

**One dashboard setting decides whether this works: Root Directory must be `apps/web`.**

Vercel detects a framework from the `package.json` of the root directory. The repository root has
no `next` dependency — it is a pnpm workspace whose root package only holds scripts — so pointing
Vercel at the repository root fails with `No Next.js version detected`. No file in the repo can fix
that; only the setting can.

```bash
npm i -g vercel
vercel login
vercel link          # when it asks for the root directory, answer: apps/web
vercel --prod
```

Then paste the environment variables `deploy-testnet.sh` printed into
**Project → Settings → Environment Variables**, plus:

| Variable | What it turns on |
|---|---|
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | Sign-in |
| `MONAD_RPC_URL` | Server-side RPC — use your own endpoint, not a shared public one |
| `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` | Goals and history are kept |

Leave `MODALIS_DEV_AUTH` unset. Redeploy, then read `/api/status` — it reports what is actually
wired up, and anything missing says so rather than appearing to work.

---

## 7. Database (optional)

Nothing is required: with no database the product runs chain-only, and loses the goal's name, the
contribution figure and the record of adjustments your rules refused.

```bash
sudo apt-get install -y postgresql
pnpm db:local        # start a local Postgres and apply the schema
pnpm db:check        # prove row-level security actually blocks cross-account reads
pnpm db:down
```

Against a hosted Supabase project:

```bash
SUPABASE_DB_URL='postgres://...' pnpm db:migrate
```

---

## 8. Everything else

```bash
pnpm risk-monitor            # the off-chain risk monitor, polling continuously
pnpm risk-monitor:once       # one pass, then exit
pnpm cre:simulate            # simulate the Chainlink CRE workflow
pnpm envio:validate          # check the indexer config
pnpm envio:dev               # run the indexer locally
pnpm contracts:sync-abis     # regenerate ABIs after changing a contract
```

---

## When something goes wrong

| What you see | What it is |
|---|---|
| `ERR_UNSUPPORTED_TYPESCRIPT_SYNTAX` | Node is older than 22. `node -v` |
| `forge: command not found` | `export PATH="$HOME/.foundry/bin:$PATH"` — add it to `~/.bashrc` |
| `No Next.js version detected` on Vercel | Root Directory is not `apps/web` |
| "Modalis isn't set up on this network" | The contracts are not deployed for that chain id, or the addresses are not set |
| "Signing in isn't set up on this deployment" | `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is missing |
| "You don't have enough of everything yet" | Run `scripts/fund-wallet.sh` |
| `EADDRINUSE :3000` | `fuser -k 3000/tcp` |
| anvil won't start | `pkill anvil`, then try again |

`/api/status` is the honest answer to "what is actually running here". Read it first.
