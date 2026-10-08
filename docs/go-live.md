# Going live — step by step, from Ubuntu on WSL

This takes Modalis from your laptop to a working site on Monad testnet:
- the database migrated
- the contracts deployed
- wallet sign-in working
- every setting in Vercel
- a production deploy

Most of the work is done by one script, `scripts/go-live.sh`. The steps below get you the five values it needs.

It stops at the first problem and prints the exact fix, so you never end up with half a deployment. It is safe to run again.

Allow about 30 minutes the first time.

---

## Part 1 — Prepare the machine (once)

Open Ubuntu (WSL) and paste this block as it is:

```bash
# System tools
sudo apt-get update
sudo apt-get install -y git curl build-essential postgresql-client

# Node 22
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs

# pnpm
sudo corepack enable
corepack prepare pnpm@10 --activate

# Foundry (forge, cast, anvil)
curl -L https://foundry.paradigm.xyz | bash
~/.foundry/bin/foundryup
echo 'export PATH="$HOME/.foundry/bin:$PATH"' >> ~/.bashrc

# Vercel CLI
sudo npm i -g vercel

source ~/.bashrc
```

Check the versions:

```bash
node -v      # v22.x or newer
pnpm -v      # 10.x
forge --version
psql --version
vercel --version
```

## Part 2 — Get the latest code

```bash
cd ~/modalis            # wherever you cloned it
git fetch origin claude/awesome-gates-h1pxk0
git checkout claude/awesome-gates-h1pxk0
git pull origin claude/awesome-gates-h1pxk0
```

If `git pull` complains about local changes, run `git stash` first. **Never use `git push --force`**: it overwrites the work on GitHub with your local copy.

Make sure your commits are linked to your GitHub account (Vercel blocks deploys from unknown emails):

```bash
git config user.email "timioni1490@gmail.com"
```

## Part 3 — Collect five things

### 3a. A testnet deployer key

```bash
cast wallet new
```

This prints an **Address** and a **Private key**.

1. Paste the address into <https://faucet.monad.xyz> to get testnet MON.
2. Keep the private key for step 4.
3. Use this key for testnet only. Never send anything real to it.

Check the funds arrived:

```bash
cast balance 0xYOUR_ADDRESS --rpc-url https://testnet-rpc.monad.xyz --ether
```

### 3b. Supabase (the database)

1. Go to <https://supabase.com/dashboard>, then **New project**. Pick a region near you and save the **database password**.
2. Click **Connect** (top of the project page) and choose **Session pooler**. Copy the string.
   - Replace `[YOUR-PASSWORD]` with your password.
   - If your password contains `@ # / ? %`, either reset it to letters and numbers, or URL-encode those characters.
   - Use the *Session pooler*, not *Direct connection*. The direct one is IPv6-only, and WSL usually can't reach it.

   This is `SUPABASE_DB_URL`.
3. Open **Project Settings → API**. The **Project URL** is `NEXT_PUBLIC_SUPABASE_URL`.
4. Open **Project Settings → API Keys → Legacy API keys**:
   - **anon** is `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - **service_role** is `SUPABASE_SERVICE_ROLE_KEY`. Treat it as a password: it only ever goes into Vercel's server settings.

### 3c. Dynamic (wallet sign-in)

1. Go to <https://app.dynamic.xyz> and create an account and a project. Use the **Sandbox** environment while testing.
2. Under **Chains & Networks**, enable **EVM** and turn on **Monad Testnet**.
3. Under **Security → Allowed origins (CORS)**, add your site URL (for example `https://modalis-six.vercel.app`) and `http://localhost:3000`.
4. Under **Developers → SDK & API Keys**, copy the **Environment ID**. This is `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID`.

### 3d. Vercel

```bash
vercel login
cd ~/modalis
vercel link
```

When `vercel link` asks:
- **Set up and link?** → `Y`
- **Which scope?** → your account
- **Link to existing project?** → `Y`, then pick your Modalis project

In the Vercel dashboard, check one setting: **Project → Settings → Build and Deployment → Root Directory** must be `apps/web`.

## Part 4 — Fill in the settings file

```bash
cd ~/modalis
cp scripts/golive.env.example .env.golive
nano .env.golive
```

Paste in the values from Part 3:

| Setting | Value |
|---|---|
| `DEPLOYER_PRIVATE_KEY` | from 3a |
| `SUPABASE_DB_URL` | from 3b |
| `NEXT_PUBLIC_SUPABASE_URL` | from 3b |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | from 3b |
| `SUPABASE_SERVICE_ROLE_KEY` | from 3b |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | from 3c |
| `SITE_URL` | your site, e.g. `https://modalis-six.vercel.app` |
| `FUND_WALLET` | optional; leave empty for now (see Part 6) |

Save with `Ctrl+O`, `Enter`, then exit with `Ctrl+X`.

`.env.golive` is git-ignored, so it can't be committed by accident.

## Part 5 — Go live

```bash
bash scripts/go-live.sh
```

You will see seven numbered steps. Each one prints a green ✓ when it succeeds, or a red ✗ with the command that fixes it:

1. **Tools** — checks that everything from Part 1 is installed.
2. **Install and test** — installs the locked dependencies and runs about 280 tests (around 2 minutes).
3. **Database migrations** — creates the tables and access rules in Supabase.
4. **Contracts** — deploys to Monad testnet and keeps the addresses in `contracts/deployments/10143.testnet.json`. On later runs it reuses them.
5. **Demo tokens** — sends test tokens to `FUND_WALLET`, if you set it.
6. **Vercel** — writes every setting to Vercel and deploys to production. It also removes `MODALIS_DEV_AUTH` and `DEMO_MODE`, which must never be on in production.
7. **Live check** — reads `/api/status` on your site. You want four green lines: network, contracts, sign-in and database.

Optional switches:

```bash
SKIP_TESTS=1 bash scripts/go-live.sh        # faster re-run when only settings changed
FORCE_REDEPLOY=1 bash scripts/go-live.sh    # brand-new contracts (existing plans won't carry over)
SKIP_VERCEL=1 bash scripts/go-live.sh       # do everything except touch Vercel
```

## Part 6 — Try it as a user

1. Open your site, click **Start**, and sign in with your wallet or email through Dynamic.
2. Open **Settings**, copy the address under *Your account*, and send it demo tokens:
   ```bash
   # put the address in .env.golive as FUND_WALLET, then:
   SKIP_TESTS=1 SKIP_VERCEL=1 bash scripts/go-live.sh
   ```
3. Your wallet also needs a little testnet MON for gas: <https://faucet.monad.xyz>.
4. Build a plan, approve it, add money, and check **Activity**: every step links to a real transaction on the Monad explorer.

---

## When something goes wrong

| Message | Fix |
|---|---|
| `Can't connect to Supabase` | Use the **Session pooler** string, put the real password in, and URL-encode special characters |
| `password authentication failed` | Wrong database password. Reset it under Project Settings → Database |
| `This address has no MON` | Fund the deployer at <https://faucet.monad.xyz>, wait a minute, run again |
| `This folder is not linked to your Vercel project` | `vercel link` from the repository root |
| Vercel build: `No Next.js version detected` | Root Directory must be `apps/web` |
| Vercel blocks the deploy over the commit email | `git config user.email "timioni1490@gmail.com"`, make a new commit, push |
| Site says "Signing in isn't set up" | `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` is missing, or the site isn't in Dynamic's allowed origins |
| Sign-in pop-up closes straight away | Add the exact site URL (with `https://`, no trailing `/`) to Dynamic's allowed origins |
| "Modalis isn't set up on this network" | Contract addresses missing in Vercel. Run `SKIP_TESTS=1 bash scripts/go-live.sh` again |
| `$'\r': command not found` | The file was saved on Windows. Run `sed -i 's/\r$//' scripts/*.sh .env.golive` |

`https://your-site/api/status` always tells you what is actually running.

---

## Mainnet: why it isn't switched on yet

Turning on Monad mainnet means real people putting in real money. That needs things this project doesn't have yet, and deploying without them would put users' money at risk:

1. **Real assets and real prices.** On testnet, Modalis uses demo tokens and a demo price feed. Mainnet needs:
   - the real token addresses (USDC, wrapped BTC/ETH on Monad)
   - a price oracle contract that reads a real feed (Chainlink, Pyth or Redstone on Monad)
   - each asset registered in `AssetRegistry`

   That oracle adapter hasn't been written or tested yet.
2. **A real trading venue.** The Kuru adapter is built and tested against Kuru's router interface. It needs the live router address and the market addresses for each pair.
3. **An independent security audit** of the five contracts before they hold anyone's money.
4. **A multisig as owner.** The deployer key must hand ownership to a multisig (for example a Safe), never stay with one laptop key.
5. **Legal review.** Managing other people's money is regulated in most countries. Today the site correctly says Modalis is not an adviser, broker or fund; that has to stay true, or the right licences must be in place.

When those are ready, the same deploy script runs against mainnet:
- set `DEPLOY_DEMO_ASSETS=false`, `KURU_ROUTER_ADDRESS`, `KURU_MARKET_ADDRESSES` and `CRE_FORWARDER_ADDRESS`
- set `MODALIS_NETWORK=mainnet` and `NEXT_PUBLIC_MONAD_CHAIN_ID=143` in Vercel

The app already refuses the development sign-in bypass on chain 143.

For the hackathon, testnet is the right place: every transaction is still real and verifiable on the Monad explorer, and nobody can lose real money.
