# Monad Metropolis: project fit and evidence

Research checked on **13 October 2026**. The owner's selected track is **Consumer Products & Payments**.

## Verified public information

The official [Metropolis portal](https://hackathon.monad.xyz/) displays the 1 September–13 October build window and $250,000+ prize pool. Its detailed rules and registration-specific submission checklist require login; this environment cannot inspect the owner's entry. Do not treat unverified submission notes as official rules.

[Rise In's Monad event page](https://www.risein.com/monad/monad-metropolis-hackathon) lists Consumer Products & Payments, Onchain Finance & Trading, Social/Attention & Culture, and Trust/Identity & AI Infrastructure. It lists the submission deadline as 13 October, judging from 14–27 October and announcement on 3 November 2026. Check the portal for the exact deadline timezone and any updated eligibility conditions.

[Envio's own developer update](https://docs.envio.dev/blog/developer-update-september-2026) confirms a Best Use of Envio bounty and directs builders to the Metropolis track page. [Envio Cloud requirements](https://docs.envio.dev/docs/HyperIndex/envio-cloud-troubleshooting) require an exact supported Envio package version and repository access. This project now pins 3.12.1 and its actual CLI generates the types used to compile the handlers.

## Consumer Products & Payments: the main story

Modalis converts an everyday goal into an understandable plan, with accessible wallet onboarding and payment actions. Show the consumer's experience first: create a goal, approve limits, get test money, fund the plan, follow progress, withdraw, gift money, and participate in a savings circle. The contracts are evidence behind that experience.

The strongest differentiation is limited authority: signing in does not give Modalis unrestricted control; only the person can change their limits or withdraw. Consumer messaging must say that test tokens and market scenarios are demonstrations. The product does not promise investment returns.

Onchain Finance & Trading is also a plausible technical fit because allocation, risk monitoring, policy-checked adjustments and settlement live on Monad. That is a secondary positioning recommendation; no portal selection has been changed.

## Sponsor evidence and remaining work

The repository targets the following integrations. The owner has not separately confirmed their bounty selections.

| Integration | Functional evidence in this repository | Needed for a credible live submission |
| --- | --- | --- |
| Monad | Contract tests, real local-EVM loop, owner-signed funding/withdrawals, public testnet deployment | Healthy testnet oracle, confirmed user transactions and explorer links |
| Dynamic | SDK auth/embedded-wallet integration, signed JWT tests, active-wallet ownership checks, restricted server-wallet integration | Correct dashboard environment/origins, live email sign-in and wallet signing; configure/fund the agent to claim agent-wallet use |
| Envio | Actual codegen and handler typecheck; activity/stats readers with RPC fallback | Hosted endpoint, synced events, visible indexed activity; config/typecheck alone does not prove hosted indexing |
| Kuru | Real SDK/router ABI, allowlisted adapter and full execution-path contract tests | A real supported token market and confirmed Kuru fill. Demo assets have no live orderbook market |
| Chainlink CRE | Workflow and market-consensus tests, report encoding/receiver contract tests | Authenticated CLI simulation and, if required by the current bounty, deployment; attach the resulting evidence |
| Alchemy | Configurable RPC/WebSocket transports | A configured Alchemy service meaningfully used by the working app |

A deployed Kuru adapter is not evidence of a Kuru trade. A receiver contract is not evidence of a running CRE workflow. A configured URL is not evidence of a healthy indexer. The app and submission should reflect those distinctions.

## Live-site diagnosis

The public `/api/status` of `modalis-six.vercel.app` was reachable. It reported the core contracts and a healthy RPC, but no Kuru execution, CRE monitoring or Dynamic server wallet. A direct public call to the configured demo oracle confirmed that its price read reverts as stale. Its `maxAge` is 86,400 seconds.

This explains the generic plan-load failure: the original plan reader unnecessarily requested valuations. The rebuilt reader loads approved rules independently, while balances and price-dependent actions fail clearly until the oracle owner refreshes quotes. The browser now requests authenticated testnet recovery when an existing configured signer matches the oracle owner, with a daily Vercel cron and a wallet-owner fallback. Public status only reads. Exact mUSD saving/retrieval, payments, goal metadata and manual calculations remain useful when the pricing signer is unavailable. This preserves quote values and does not disable the staleness protection.

## Submission checklist to confirm in the portal

Check the exact rules in the owner's account: selected track/bounties, deadline timezone, team eligibility, repository visibility and licence, allowed pre-existing work, AI assistance disclosure, video duration/accessibility, testnet/mainnet requirements, and required sponsor-specific proof.

The repository already has MIT licensing and an AI disclosure; the disclosure now also includes OpenAI Codex assistance for this repair. Prepare a public working demo with actual Monad receipts. This environment has not submitted an entry or changed the selected track. The user authorized Git pushes to the existing Vercel-connected repository; deployment evidence is recorded in `rebuild-verification.md`.

## Consumer and payments update

The second build adds `/demo`, an account-free interactive preview explicitly labelled sample data, and `/app/payments`, a real testnet send/request hub. A request URL specifies the recipient, six-decimal mUSD amount, purpose, and Monad testnet chain. The recipient reviews the amount and signs a real ERC-20 transfer; creating or opening a link never signs or transfers funds. Native sharing uses a clipboard fallback. Savings circles remain contract-backed.

This is concrete Consumer Products & Payments evidence: account-free discovery, everyday payment requests, owner-approved transfers and group saving. The mandate and rebalance flow support the secondary Onchain Finance & Trading narrative. These are fit recommendations, not a guarantee of eligibility or awards. The authenticated portal's exact sponsor conditions still need verification; mock trades cannot establish Kuru use, nor can local workflow tests establish a deployed CRE integration.

The header and phone dock now collapse into accessible labelled sheets. Wallet SDK controls no longer occupy an unconstrained header slot. Notifications and multi-goal links appear only when saved data is configured; savings circles appear only when its contract is present. Actual testnet sign-in is reached from the demo page, so the consumer entry remains “Try the demo.”

### Design research applied

- [Base UI source](https://github.com/mui/base-ui), MIT: use the already installed dialog primitive for focus trapping, Escape, outside dismissal, scroll locking and focus return; [official dialog documentation](https://base-ui.com/react/components/dialog). No unrelated project code was imported.
- [shadcn/ui source](https://github.com/shadcn-ui/ui), MIT: composable navigation and progressive disclosure informed the component layout; no new generated component bundle or dependency was added.
- [Motion source](https://github.com/motiondivision/motion), MIT: existing layout springs, short fades, and a [global reduced-motion policy](https://motion.dev/docs/react-motion-config). Sheet motion is applied to the surface, so touch targets remain stable.
- [Linear's design reset](https://linear.app/now/a-design-reset): rethink tasks for mobile rather than shrinking the desktop toolbar. Modalis retains its own visual identity and code.

References were checked on 13 October 2026. The official portal still presents an authentication screen; public third-party submission repositories and social mirrors are not treated as eligibility authority.


## Savings minimums and retrieval timing research

Checked on 13 October 2026. The owner clarified that “minimum savings” means the smallest amount per contribution. It does not mean a minimum balance or an initial opening deposit.

| Concept | Research finding | Modalis behavior |
| --- | --- | --- |
| Minimum contribution | Opening deposits, recurring contribution minimums and minimum account balances are different terms. Product-specific minimums should be stated explicitly. | Custom per-contribution dollar amount with cents; 0 means no personal minimum. Checked against the complete contribution before allocation. |
| Easy access | MoneyHelper describes flexible saving and withdrawal access; opening deposits can be small. | Existing owner withdrawal rights remain available, including while paused. |
| Notice savings | MoneyHelper gives typical notice-account examples of 30–120 days; notice starts on a withdrawal request. | A 30-day personal hold is not presented as a notice account. The chosen reminder starts at plan approval, not at a withdrawal request. |
| Fixed term / lock | A fixed term limits access according to its explicit terms. OpenZeppelin's VestingWallet can hold assets until a specified time when duration is zero. | No lock is added to the existing vault. An enforced lock would need a separately designed, tested and deployed contract with explicit deposit/early-exit terms. |
| Processing time | A hold period and the time a transaction takes to settle are separate. | Custom days describe the user's saving intention. Withdrawal still needs wallet signing and network confirmation; there is no settlement-time guarantee. |
| Custom context | People may need exceptions or purpose notes. | Up to 500 plain-text characters, displayed safely and never acted on as a payment instruction. |

Primary references:

- [MoneyHelper: regular savings accounts](https://www.moneyhelper.org.uk/en/savings/types-of-savings/regular-savings-accounts): recurring payment bounds and missed-payment/withdrawal conditions are product-specific.
- [MoneyHelper: instant access savings](https://www.moneyhelper.org.uk/en/savings/types-of-savings/instant-access-savings-accounts).
- [MoneyHelper: comparing account types](https://www.moneyhelper.org.uk/en/savings/how-to-save/cash-savings-at-a-glance).
- [CFPB: minimum balances and withdrawal limits](https://www.consumerfinance.gov/ask-cfpb/why-am-i-being-charged-for-transactions-in-my-savings-account-en-2150/).
- [OpenZeppelin: VestingWallet and time locks](https://docs.openzeppelin.com/contracts/5.x/api/finance#VestingWallet).

These are product-design references from different jurisdictions, not terms offered by Modalis or universal regulatory rules. The demo uses valueless test tokens and makes no deposit-insurance or interest promise. Custom contribution settings and accessible retrieval review strengthen the Consumer Products & Payments flow; they do not by themselves establish sponsor-bounty eligibility.
