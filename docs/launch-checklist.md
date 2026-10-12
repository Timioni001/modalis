# Launch checklist — every key, in order, and what to submit

One page. Work down it. Nothing here is guesswork: the addresses were checked on-chain, and the
behaviour of each setting was read out of the code.

---

## The decision: submit on testnet

**Submit the Monad testnet deployment.** Do not deploy to mainnet for this.

Monad Metropolis accepts either — the requirement is a Monad deployment evidenced by contract
addresses or transaction hashes, on mainnet *or* testnet. Testnet satisfies it completely, and
every transaction is still real and verifiable on the explorer.

Mainnet would be the wrong call, and not because of effort:

| Blocker | Why it matters |
|---|---|
| No security audit | Five contracts holding other people's money, unaudited |
| Demo tokens are props | mUSD, mBTC, mETH, mBOND have no value and no real market |
| Demo price oracle | A mainnet plan needs a real feed (Chainlink, Pyth, Redstone) and that adapter is not written |
| One key owns everything | Ownership must move to a multisig first |
| Not licensed | Managing other people's money is regulated nearly everywhere |

Deploying to mainnet would invite people to put real money behind unaudited contracts pricing
props off a fake oracle. On testnet the product is honest about what it is, and the engineering is
exactly the same.

`docs/go-live.md` has the mainnet path for later, when those five are fixed.

---

## Part 1 — Keys to collect

Make the wallet keys with `cast wallet new` and fund each at <https://faucet.monad.xyz>. Use keys
that exist **only** for testnet.

### Required — nothing works without these

| Setting | Where to get it | Without it |
|---|---|---|
| `DEPLOYER_PRIVATE_KEY` | `cast wallet new`, fund it | No contracts |
| `NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID` | app.dynamic.xyz → Developers → SDK & API Keys | Nobody can sign in |
| `SUPABASE_DB_URL` | Supabase → Connect → **Session pooler** | No goals, history or notifications |
| `NEXT_PUBLIC_SUPABASE_URL` | Project Settings → Data API → Project URL | Same |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Project Settings → API Keys → Legacy → **anon** | Same |
| `SUPABASE_SERVICE_ROLE_KEY` | The same page → **service_role** | Same |
| `SITE_URL` | Your Vercel address | The final health check is skipped |

In Dynamic, also: enable **EVM** and **Monad Testnet** under Chains & Networks, and add your site
address under Security → Allowed origins. Sign-in fails silently without that.

### Worth it before any demo

| Setting | Where to get it | What it adds |
|---|---|---|
| `FAUCET_PRIVATE_KEY` | `cast wallet new`, fund it | "Get test money" works in-app. A judge never leaves for a faucet |
| `MONAD_TESTNET_RPC_URL` | Alchemy, QuickNode or dRPC | Your own endpoint. The public one rate-limits mid-demo |
| `ORACLE_UPDATER_PRIVATE_KEY` | `cast wallet new`, fund it | "Simulate a market move" — without it the drift-and-adjust story cannot be shown |

### The track integrations

| Setting | Value / where | Track |
|---|---|---|
| `CRE_FORWARDER_ADDRESS` | `0xF8344CFd5c43616a4366C34E3EEE75af79a74482` | Chainlink |
| `KURU_ROUTER_ADDRESS` | `0x7EFbE105Ca7415dE98F96622173458ac1c054630` | Kuru |
| `KURU_MARKET_ADDRESSES` | `0xa241896A7Dbe8a550D2E5fF7A914bB1989ceD2D9` | Kuru (MON-USDC) |
| `DYNAMIC_API_TOKEN` | app.dynamic.xyz → Developers → API tokens | Dynamic |
| `DYNAMIC_AGENT_WALLET` | `pnpm agent:create` prints it; fund the address | Dynamic |
| `ENVIO_GRAPHQL_URL` | envio.dev → deploy from GitHub, root `integrations/envio` | Envio |

Two traps, both of which look like they are working when they are not:

- The Chainlink directory lists a **mock** forwarder (`0xB9F7…`) beside the production one. The
  mock is only for `cre workflow simulate`. Pinning the receiver to it means accepting reports
  from a simulator. Use `0xF834…` above, and confirm it for your tenant with
  `cre workflow supported-chains`.
- **Leave `KURU_API_URL` unset.** Trades route to Kuru only when the adapter address *and* that
  URL are both set, and the demo tokens have no Kuru market. The adapter still deploys against
  Kuru's real router and is approved as a venue — that is the honest testnet claim.

### Nice to have

| Setting | Where | What it adds |
|---|---|---|
| `AI_API_KEY` | console.anthropic.com | Typed goals: "a house in 5 years" |
| `AI_BASE_URL` + `AI_MODEL` | Any OpenAI-compatible provider | Use that provider instead |
| `SENTRY_DSN` | sentry.io → Project settings → Client Keys | Errors reported, secrets scrubbed |
| `NEXT_PUBLIC_SITE_URL` | Your site address | Correct link previews |
| `MANAGER_PRIVATE_KEY` | `cast wallet new`, fund it | Adjustments, if you skip the Dynamic agent |

### Never set in production

`MODALIS_DEV_AUTH`, `NEXT_PUBLIC_DEV_WALLET`, `DEPLOYER_PRIVATE_KEY`, `SUPABASE_DB_URL`.
`go-live.sh` strips these on every run and `check-env.sh` flags them.

---

## Part 2 — Run it

```bash
cd ~/modalis
git pull origin claude/awesome-gates-h1pxk0
cp scripts/golive.env.example .env.golive   # first time only
nano .env.golive                            # paste in everything from Part 1

bash scripts/go-live.sh                     # migrates, deploys, configures Vercel, deploys the site
bash scripts/add-integrations.sh            # Kuru adapter, CRE receiver, savings circles
SKIP_TESTS=1 bash scripts/go-live.sh        # tell the site the new addresses
bash scripts/verify-contracts.sh            # publish the source on the explorer
bash scripts/check-env.sh                   # confirm nothing is missing
```

Then open `https://your-site/api/status`. That is the honest answer to "what is actually running".

---

## Part 3 — Prove it works, as a user

1. Open the site on a phone, sign in with email.
2. **Get test money** in the app. It should need no faucet and no terminal.
3. Create a plan, approve it, add money.
4. **Activity** — every step links to a real transaction on the Monad explorer.
5. Add a second goal and check the money fills the first goal to target before the second.
6. Withdraw part of it, and read what it costs the goal before signing.
7. Simulate a market move, then approve the adjustment it proposes.
8. Switch to dark mode, then reload — it should stay dark.

If any step needs the terminal, a judge will hit the same wall.

---

## Part 4 — The submission itself

These are rules, not polish. Each one can cost the entry.

- [ ] **Open source, OSI licence.** MIT, in `LICENSE`. Done.
- [ ] **Public GitHub repo.** Make sure it is public, not just the branch.
- [ ] **AI tools disclosed in the README.** Required, and now in the "How this was built" section.
- [ ] **Demo video, three minutes maximum, publicly accessible.** It must show the product
      working and real Monad transactions — not slides, not mockups. Use the Part 3 order; it is
      already a script. `docs/demo.md` has one.
- [ ] **Contract addresses or transaction hashes.** In `docs/testnet-contracts.md`, and the
      explorer links are in the app.
- [ ] **Why Monad.** Not "it is fast": the parallel-execution argument is in
      `docs/parallel-execution.md`.
- [ ] **Per-track evidence.** `docs/bounty-matrix.md` maps each sponsor to the code that uses it.
- [ ] **Commits inside the hackathon window.** Check before submitting.
- [ ] Team size 1–5. Submissions are rolling and late ones are not accepted; what exists at the
      deadline is what gets judged.

The official checklist at <https://hackathon.monad.xyz> is login-gated, so confirm these against
it yourself — the list above came from participants' notes, not the rules page.

---

## If you only have an hour

1. `FAUCET_PRIVATE_KEY` and `MONAD_TESTNET_RPC_URL` — the first two minutes of anyone's demo.
2. `ORACLE_UPDATER_PRIVATE_KEY` — without it there is no adjustment story to show.
3. Paste the Kuru and Chainlink addresses, then `add-integrations.sh`. Two tracks, one command.
4. Record the video.

Envio and the AI key are the ones to drop if time runs out. Neither is visible in a three-minute
demo.
