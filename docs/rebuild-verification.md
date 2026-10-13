# Functional rebuild verification

Checked on **13 October 2026**. Work is confined to this repository. Primary hackathon track: **Consumer Products & Payments**.

## Executed checks

| Check | Result | Command / evidence |
| --- | --- | --- |
| Solidity policy, permissions, slippage, replay, pause/exit, Kuru, CRE, circles | **54 passed** | `pnpm contracts:test` |
| Package and web unit/security tests | **291 passed** | `pnpm test` — auth 28, chain 26, DB 7, portfolio 9, execution 6, AI 32, domain 124, web 59 |
| Risk-monitor tests | **5 passed** | `pnpm --filter @modalis/risk-monitor test` |
| CRE market/consensus tests | **3 passed** | `pnpm --filter @modalis/cre-risk-monitor test` |
| TypeScript | **Passed** | `pnpm typecheck`, including Envio codegen and generated handler types |
| Envio schema/ABI consistency | **Passed** | `pnpm envio:validate` — four contracts, twelve events |
| Full local EVM loop | **11/11 passed**, 13 real transactions | Fresh Anvil deployment through `scripts/demo-local.sh`; invalid trade actually reverted; manager withdrawal refused |
| PostgreSQL schema and RLS | **Passed** | PostgreSQL 16; all migrations and the adversarial `supabase/local/01_rls_check.sql` checks |
| Database services through real PostgREST | **3 passed** | Goals, ownership, notifications, timelocked automation, history, contribution metadata and custom savings behavior |
| Consumer browser flow | **Passed** | Real plan approval, faucet balances, deposit, partial withdrawal, pause/resume, manager revocation/restoration, no browser exceptions |
| Responsive browser checks | **Passed** | Overview, money, plan, activity, circles, scenarios and Ask at 320, 390 and 1280 pixels; no horizontal overflow |
| Gifting / circle browser flow | **Passed** | Real token gift, circle creation, first member payment and second member payment; pot reached the correct recipient |
| Production build | **Passed** | `pnpm build`; final release verification performed after source changes |

The recorded browser flows are in `apps/web/e2e/consumer-flow.spec.ts` and `apps/web/e2e/navigation-demo.spec.ts` and run with `pnpm test:e2e`. They refuse hosted origins and require the explicit local-development flag. They use unlocked local accounts, not private keys in browser code.

The executed toolchain was Node 24.19.0, pnpm 10.28.0, Foundry 1.7.1, PostgreSQL 16 and Playwright 1.64.0. The documented Ubuntu WSL setup uses Node 22 LTS and the pinned pnpm version. The older README's test counts and Envio verification status have been updated.

## Confirmed failure causes and repairs

- **Expired live demo prices:** a public call to the deployed oracle reverted `PRICE_STALE`, with `maxAge = 86400`. Price-independent plan reads now keep approved rules visible; balance/funding/trading reads fail explicitly until fresh quotes exist.
- **Lost contribution metadata:** plan approval previously saved a chain-only contribution of zero. Validated original answers now preserve amount/cadence; the chain target remains authoritative.
- **Multiple-wallet identity:** the selected wallet must appear in verified JWT credentials. An address supplied by the browser is never accepted as proof by itself.
- **Authentication lifecycle:** expiry is required, origin audiences are accepted through per-environment signature binding, and both production and mainnet refuse the development bypass.
- **Local faucet no-op:** an absent Multicall3 address can accept a transaction without minting. The code now detects deployed code, confirms fallback mints and verifies arrival.
- **Unbounded / stale UI loads:** requests have timeouts and cancellation; old-account responses and stale balances are cleared; missing wallet initialization and price failures have visible recovery states.
- **Personal-response caching:** the service worker no longer caches personal APIs or pages, and deletes its old personal-data cache on activation.
- **Transaction controls:** adjustment requests include their one-time key; settings await a successful receipt; plan saving reports partial failures and offers a retry.
- **Mobile sizing:** contribution inputs/selector, narrow header/dock, safe-area spacing and notification panels fit phone widths.
- **Compilation boundaries:** client code uses the browser-safe domain entry point and loads Dynamic separately; broad package imports are optimized.
- **Deployment / Envio:** new deployments include savings circles; readiness checks actual bytecode and RPC chain; Envio addresses are quoted, SDK version pinned and generated types compiled.

## What remains outside this verification

The initial local verification did not change the Vercel deployment. The later authorized publication is recorded below. Its public RPC and contract addresses were inspected, but no signed-in production session or real hosted user action was performed. No oracle-owner key, hosted database credential or direct Vercel administrator token was attached to this environment. Publication used the existing GitHub-to-Vercel connection.

To apply the repair to that deployment:

1. Refresh the existing demo oracle using its actual owner key: `pnpm prices --refresh --once`. Schedule a supervised refresher below the 24-hour expiry. This re-publishes synthetic prices without disabling staleness or changing their values.
2. Deploy the updated web code with the existing core addresses and correct Dynamic environment/origins. Do not replace the existing vault just to update the web app.
3. If savings circles are absent, use the existing integration-deployment workflow and add its address to the web configuration.
4. Perform live email sign-in, funding, withdrawal and receipt checks from a phone.
5. Supply the required sponsor evidence: hosted Envio syncing, a real Kuru market fill, CRE simulation/deployment, Dynamic agent-wallet use and Alchemy use where those bounties are selected.
6. Confirm the owner's final track selections, submission deadline timezone, video and disclosure rules in the login-gated Metropolis portal.

Local execution, a configured address or successful type generation does not certify those live integrations. Demo assets, market scenarios and the local oracle are synthetic; their transactions, contract checks and receipts are real. No mainnet deployment or security-audit claim is made.

See [wsl-commands.md](wsl-commands.md), [rebuild-architecture.md](rebuild-architecture.md) and [metropolis-research.md](metropolis-research.md).

## Consumer and payments release update

The five browser tests passed together using a fresh Webpack development cache. They cover account-free preview arithmetic and keyboard tabs, sheet focus/Escape/outside dismissal and route closure, legal-link clearance and reserved dock space, clipboard sharing, malformed/cross-network request rejection, and actual funding/withdrawal/pause/revoke flows. The transfer test sends exactly **10.123456 mUSD** and checks the recipient's exact raw token balance increase. The circle test confirms the full pot reaches the correct member. Responsive checks include 320, 360, 390, 768 and 1280 pixels.

Initial verification exposed development compiler memory exhaustion and interrupted cache artifacts. The local demo now defaults to Webpack with memory optimizations, excludes unused cloud-wallet browser libraries, and keeps actual Anvil signing. Its SDK boundary throws if accidentally reached and is disabled in production. The server wallet SDK is a pinned direct web dependency so native binaries are externalized correctly. No local or mocked wallet authentication is claimed as a live Dynamic integration.

The final production build passed with the actual cloud SDK, with all development aliases disabled. The served production `/demo` also passed an interactive browser check at 320, 390, 768 and 1280 pixels: no page errors, API writes or horizontal overflow.


## Custom savings extension verification

The four new domain tests exercise exact-cent boundaries, malformed/extreme inputs, compatibility with existing answers, stripping browser-supplied start dates, and UTC day arithmetic. The complete package/web suite now has **291 passing tests**. The real PostgreSQL/PostgREST run has **three passing integration cases**; the new case checks persistence, below-minimum rejection, acceptance at the exact minimum, smaller per-asset transfers, early-retrieval warning, the exact waiting-period boundary, SQL constraints and foreign-owner write rejection. All migrations applied and migration 0004 also reapplied successfully. Existing adversarial RLS checks passed again.

The additional 320-pixel browser flow passed against real local Anvil and the local integration database: custom onboarding validation, approval and saved block time, safe display of literal script text in notes, reload, direct preference editing without a new mandate transaction, below-minimum funding rejection in both UI and API, early-withdrawal review, malformed input rejection and foreign-account isolation. The anonymous preview browser case also passed again with the new fields expanded at 320, 360, 390, 768 and 1280 pixels; it issued no API writes. The six distinct browser cases consist of the earlier five plus this saved-settings flow; they were run in the database configurations appropriate to each case.

Personal retrieval time remains an editable reminder. During that local verification, no lock was added to the deployed vault and no hosted database was changed. Publication happened later as recorded below. Persistence requires the new migration on the dedicated configured database. The source archive includes that migration, the UI, the API and the tests.

The full repository typecheck and updated production build both passed. The production server's `/demo` passed a further interactive check with custom contribution and retrieval fields at 320, 390, 768 and 1280 pixels, with no browser exceptions, API writes or horizontal overflow. Local database containers were removed after verification.


## Vercel publication

The owner subsequently requested publication through Vercel instead of local WSL commands. The update was committed, reconciled with the remote's new pitch files, and pushed without force to `claude/awesome-gates-h1pxk0` in `Timioni001/modalis`. The initial published commit is `3bcf9726a278799e65a9c8a0313ba190a1aa0daf`; [Vercel reported success](https://vercel.com/timilabs/modalis/CUXZXaNnTDNmMHXqKEkYqz5RBtWY), and all GitHub Actions checks passed. The public `/demo` was checked in a real Chromium browser at 320, 390, 768 and 1280 pixels: contribution arithmetic and custom savings fields worked, with no page exceptions, API writes or horizontal overflow. Public testnet transactions were not signed by the assistant.

The hosted `/api/status` confirmed two existing operational settings: demo mode is disabled and synthetic quotes are expired. A follow-up browser recovery control uses the existing authenticated `scenario: refresh` action from the price-independent plan page. It is shown only on Monad testnet with demo mode enabled and expired quotes. It updates quote timestamps while preserving values; it never changes a mandate or signs a user deposit/withdrawal. The endpoint is rate-limited. A real local browser check advanced the Anvil clock beyond quote expiry, invoked the control, checked restored pricing/funding readiness and verified every quote value stayed unchanged. This is the seventh distinct browser case.

Vercel dashboard configuration is still owned by the user: set production `DEMO_MODE=true` and the private `ORACLE_UPDATER_PRIVATE_KEY` to the account that owns the existing testnet oracle, then redeploy and use **Your plan → Refresh demo prices**. Existing `DEPLOYER_PRIVATE_KEY` can serve as the server fallback if it is the same oracle owner. No secret should be supplied in chat or bundled into the browser. Saved custom preferences also require migration 0004 in the dedicated database; a Vercel deployment cannot apply a Supabase schema change automatically.
