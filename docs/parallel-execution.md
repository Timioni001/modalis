# Designed for Monad's parallel execution

Monad runs transactions in parallel and re-executes only the ones that turn out to touch the same
storage as an earlier transaction in the block. So the less two people's transactions share, the
more of a block runs at once. Modalis keeps each person's state in its own storage on purpose.

## What each person writes

| Contract | Storage | Keyed by |
|---|---|---|
| `PortfolioMandate` | `_mandates`, `_allocations`, `_manager` | the owner's address |
| `PortfolioVault` | `_balances[owner][token]` | the owner, then the token |
| `RebalanceExecutor` | `nextNonce[owner]` | the owner's address |

There is no global counter, running total, or list of users in any Modalis contract. Totals the app
shows (money held, number of plans) are computed by reading, never kept in a shared slot that every
deposit would have to update. The contracts emit events instead, and the indexer or `/api/stats`
adds them up off-chain.

So when the risk monitor sends adjustments for many people in one block, each adjustment reads and
writes that person's mandate, balances and nonce, and nothing belonging to anyone else.

## Where state is still shared, honestly

- **Token balances of the vault.** A deposit moves tokens with `transferFrom` into the vault, so the
  token contract updates `balanceOf(vault)`. Two people depositing the same token in the same block
  both touch that slot. Monad handles this correctly by re-executing the later one; it just runs
  less in parallel. A per-user escrow address would remove it, at the cost of more deployment
  complexity. We kept the single vault.
- **The trading venue.** Every adjustment trades against the same adapter (the demo adapter today,
  Kuru later), and a real order book is shared state by nature.
- **The price oracle** is read by everyone, but reads never conflict. Only the price updater writes.

## Why it matters for Modalis

The product is "a plan that manages itself". A market move pushes many plans off target at the
same moment, so the monitor's job is to send many independent adjustments at once. On Monad those
adjustments land in the same block, mostly in parallel, for a fraction of a cent each. That's what
makes managing small balances automatically affordable.
