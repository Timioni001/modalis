# Modalis implementation architecture

The work stays inside this repository. No other repository, user configuration, or unrelated application is imported.

## Product and track

Primary submission: **Consumer Products & Payments**, as selected by the owner. The product is a goal-based consumer money app with plain-language onboarding, an embedded wallet, owner-approved deposits and withdrawals, gifting, and rotating savings circles. Onchain Finance & Trading is a secondary fit for its policy-enforced portfolio adjustments; this does not change the portal registration.

## Practical architecture

| Layer | Responsibility | Authority |
| --- | --- | --- |
| Next.js / React | Responsive forms, wallet prompts, balances, progress, activity, settings | Requests actions; signs owner actions in the owner's wallet |
| `packages/domain/client` | Browser-safe vocabulary, financial display models, pure calculations | No database, execution, or AI-provider access |
| `packages/domain` | Goal/plan translation, projections, funding and withdrawal plans, activity, automation | Validates and proposes; never signs owner actions |
| `packages/auth` | Dynamic JWT signature, expiry, environment binding, verified active-wallet selection | Establishes identity, never financial permission |
| `packages/db` / Supabase | Goal descriptions, contributions, interviews, notifications and policy history | Server writes verified chain records; RLS isolates users |
| `packages/chain` / viem | Typed contract reads, owner-signed writes, RPC selection, receipts | Contract state is authoritative |
| Solidity contracts | Limits, access control, deposit/withdraw accounting, replay and slippage protection, circles | Final authority over funds |
| Risk monitor / CRE / Envio / Kuru | Monitoring, independently signed signals, indexed history, execution routing | Narrow integration-specific roles |

Dynamic's SDK is loaded separately when hosted sign-in is configured. A development-only local provider uses unlocked Anvil accounts over loopback; no owner private key is bundled into the browser. Production refuses the development authentication bypass.

The main application is Node 22+ TypeScript, Next.js 16.3.8, React 19, pnpm 10.28.0, Solidity/Foundry, and PostgreSQL/Supabase. Package versions are locked. Envio is pinned to 3.12.1 and generates its schema types before compilation.

## Core functionality

1. Interview and validated deterministic plan drafting, with optional AI interpretation.
2. Owner signs approved limits on-chain; separately delegates restricted adjustment authority.
3. Original contribution amount/cadence and goal metadata are saved alongside the chain policy. Target and limits always come from the chain.
4. Funding plans check wallet holdings, allowances and live prices; the owner signs approval/deposit transactions.
5. Money, progress and activity come from live state and confirmed receipts. Price failures never become fabricated balances.
6. Withdrawal planning explains the effect on the goal; partial and emergency exits remain owner-only.
7. Settings revoke the manager, pause/resume, adjust automation, choose display preferences and export/delete stored personal data.
8. Gifting transfers test tokens into a recipient's wallet; only the recipient can fund their own plan.
9. Savings circles enforce membership, payout order and deadline refunds in a separate contract.

## Reliability and security changes

- A price-independent `PlanState` exposes only approved policy and target allocations, with no fabricated balance fields.
- Stale oracle reverts have an actionable 503 response. No expired quote is used for funding or trading.
- Requests are bounded, cancellable and protected against responses from a previous account. Failed balance reads clear the old financial figures.
- The service worker caches only public assets and purges the old cache that could contain personal API responses.
- Plan-saving validates answers, verifies supplied approval receipts against the sender, contract and function, restores contribution metadata, and reports partial persistence honestly.
- Adjustment requests carry their one-time key; settings wait for successful confirmation before displaying completion.
- Deployment readiness checks the RPC chain and actual core contract bytecode, rather than treating address strings as proof of deployment.
- Optional integrations are reported as configured capabilities, not as proof of successful live service execution.

## Implementation sequence

Repository and full README inspection → architecture proposal → baseline tests → authentication and persistence fixes → plan/valuation separation → mobile layout corrections → transaction and deployment fixes → database/Envio verification → browser transaction checks → production build and WSL documentation.

See [wsl-commands.md](wsl-commands.md) for exact local commands, [metropolis-research.md](metropolis-research.md) for track evidence, and [rebuild-verification.md](rebuild-verification.md) for executed checks and deployment limitations.

## Consumer preview and payments extension

The public `/demo` route is a client-only sample-data sandbox with no balance API calls, signing or persistence. Its controls illustrate contribution arithmetic and lead to a separate, explicit testnet action. `/app/payments` runs under the authenticated portfolio layout and creates validated request links or sends the user to the existing transfer review flow. Links contain only public recipient details and an optional purpose; they confer no authorization. The transfer checks Monad Testnet, token type and bounded amounts before asking the wallet to sign.

Navigation sheets use the existing Base UI dialog rather than custom focus traps. Capability checks hide unavailable optional destinations, and responsive labels replace crowded icon rows. A global MotionConfig respects reduced-motion preferences; sheet transitions use the same timing and focus behavior across pages.

The public provider does not initialize Dynamic. It carries only deployment information until the user enters `/app`, `/onboarding` or `/plan`; this keeps the preview available independently of sign-in services. The Node wallet SDK is an explicit web runtime dependency, pinned to the chain package's version, so Next can externalize its native binaries.

The explicit local Anvil mode excludes the unused browser cloud-wallet packages from its compilation graph. Its replacement module throws if reached; it cannot issue a token or synthesize a signer. The existing LocalWallet still signs against the unlocked loopback node. Both bundlers support this boundary, and production refuses it. The verified low-memory local run uses Webpack (`bash scripts/dev-local.sh --webpack`).

## Custom savings settings

Each plan can have an optional minimum per complete contribution (USD decimal string, $0–$100,000, cents supported), a personal retrieval waiting period (0–3,650 calendar days after approving the plan), and up to 500 characters of custom context. Zero disables a personal minimum or waiting period. These are separate from signed trading limits and do not modify the vault's owner withdrawal rights.

A browser-safe, pure validator checks the form; the server independently checks the same bounds and rejects contributions below the saved minimum before producing token transfers. Each transfer within the split may be smaller than the whole-contribution minimum. The owner's wallet still signs every transfer. Payments into another wallet and circle contributions use their own rules.

Migration `0004_savings_preferences.sql` stores optional settings on the existing owner-scoped goal. SQL constraints also reject malformed amounts, fractional/out-of-range days and oversized text. The start time comes from the confirmed approval block, never the browser clock. The signed draft has no invented start date. Editing saved preferences preserves the recorded start and requires authenticated ownership; it neither sends a contract transaction nor changes authority.

Onboarding presents these fields in a collapsed disclosure, approval reviews them separately, the plan supports direct editing, Add money shows the minimum and disables undersized amounts, and withdrawal review warns if the personal retrieval date has not arrived. The emergency exit remains available. Notes are displayed as escaped text and are never AI or transaction instructions. The anonymous preview exercises the same controls without persistence or signing.

Saved settings require a configured database and migration 0004. With no database, approval reports that goal details were not saved; the app never claims those preferences are enforced on-chain. No new dependency, contract deployment or imported repository is required.
