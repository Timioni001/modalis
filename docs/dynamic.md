# How Modalis uses Dynamic

Dynamic does three jobs in Modalis. Each one is wired into the product, not a logo on a slide.

| Job | Who signs | Where in the code |
|---|---|---|
| Sign in with email and get a wallet the person owns | the person's **embedded wallet** | `apps/web/components/wallet-context.tsx`, `app/providers.tsx` |
| Prove to the server who is asking | Dynamic's **JWT**, checked against Dynamic's JWKS | `packages/auth/src/session.ts` |
| Carry out "Do it for me" adjustments | a **Dynamic server wallet** (the agent) | `packages/chain/src/agent.ts`, `agent-env.ts` |

## 1. The person's embedded wallet

Signing in with an email creates an embedded wallet on Monad, so a first-time user never sees
"connect wallet". That wallet signs every owner action: setting the plan, adding money, taking
money out, pausing, and the two permission changes below. Adding money approves and deposits with
one signature when the wallet supports batched calls (EIP-5792 `wallet_sendCalls`,
`packages/chain/src/owner.ts` `canBatch` / `sendBatch`), and falls back to two otherwise.

## 2. Server-side identity

Every browser call carries the Dynamic JWT. `packages/auth` verifies it against Dynamic's published
keys, and the wallet address inside the verified token is the only account the server acts on.
`apps/web/test/api-ownership.test.ts` audits that no route takes an account from the request body.

## 3. The agent: a Dynamic server wallet

"Do it for me" needs something that can rebalance a plan while the person is away. That is the
agent, and it is a Dynamic server wallet: its key is split by Dynamic's MPC between Dynamic and
Modalis, so no single machine holds it whole.

**How a person delegates.** When they allow adjustments (on the plan page, or Settings →
"Allow adjustments"), their embedded wallet signs one transaction:

```
PortfolioMandate.setManager(agentAddress)
```

**What the agent can do.** Exactly one thing: call `RebalanceExecutor.execute` for plans that
named it, and the executor re-checks every limit on-chain before anything moves. It cannot:

- take money out (`PortfolioVault.withdraw` only ever pays out the caller's own balance),
- change a limit or the plan (`setMandate` only writes the caller's own plan),
- act for anyone who didn't name it, or move money while the plan is paused.

**How a person revokes.** Settings → **Revoke adjustments** signs `setManager(0x0)`. It takes
effect in the next block; the agent's next attempt reverts.

**Where you can see it.**

- `/security` (status panel): "Adjustments come from a separate wallet… · Dynamic server wallet",
  and the agent's address under "For anyone who wants to check", linked to the explorer.
- `/proof/<address>`: "Who can adjust it" names the Dynamic server wallet the owner allowed, and
  each adjustment the chain shows it sent is marked "signed by the Dynamic server wallet".
- Settings: "Who makes adjustments: A Dynamic server wallet (0x…)".

**One signer everywhere.** A plan names a single manager, so the web app (`/api/adjustment/execute`,
via `apps/web/lib/server.ts`) and the risk monitor (`services/risk-monitor/src/cli.ts`) both get
their signer from `getAgentWallet()`. When the Dynamic settings are present they win; otherwise
`MANAGER_PRIVATE_KEY` is used, which keeps local development working with no Dynamic account.

The SDK (`@dynamic-labs-wallet/node-evm`) is Node-only, so it is loaded lazily from the
`@modalis/chain/agent` entry point and kept out of every browser bundle
(`serverExternalPackages` in `apps/web/next.config.ts`).

## Setting it up

1. In the Dynamic dashboard, enable server wallets for the environment and create an API token
   (Developers → API tokens).
2. From the repo, in WSL:

   ```bash
   export DYNAMIC_API_TOKEN=dyn_...            # the token from step 1
   export NEXT_PUBLIC_DYNAMIC_ENVIRONMENT_ID=... # already in Vercel
   pnpm agent:create
   ```

   It prints `DYNAMIC_AGENT_ADDRESS` and `DYNAMIC_AGENT_WALLET`. The second is a secret (it is
   Modalis's share of the key): put it in `.env.golive`, never in git.
3. Send the agent address some testnet MON for gas (https://faucet.monad.xyz).
4. Add `DYNAMIC_API_TOKEN` and `DYNAMIC_AGENT_WALLET` to `.env.golive` and run
   `bash scripts/go-live.sh`. It copies both to Vercel.
5. Anyone who had allowed the old manager key allows adjustments again, so their plan names the
   new agent. New plans pick it up automatically.

Run `pnpm agent:create` once. Running it again creates a different wallet.
