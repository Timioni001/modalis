# Kuru integration

Modalis is the portfolio manager. **Kuru is the execution venue.** Modalis does not build an
exchange: the portfolio engine decides *"reduce mBTC by 7%, increase mUSD by 7%"*, and Kuru's
on-chain orderbook settles it on Monad.

## Provenance of the ABI

`abi/Router.json` is the **unmodified** Router ABI shipped in the official Kuru SDK:

| | |
|---|---|
| npm package | `@kuru-labs/kuru-sdk` |
| version | `0.0.95` |
| path in package | `abi/Router.json` |
| source repo | https://github.com/Kuru-Labs/kuru-sdk |

Nothing in this directory is hand-written or inferred. `contracts/src/interfaces/IKuruRouter.sol`
declares exactly one function, transcribed from that file:

```solidity
function anyToAnySwap(
    address[] calldata _marketAddresses,
    bool[] calldata _isBuy,
    bool[] calldata _nativeSend,
    address _debitToken,
    address _creditToken,
    uint256 _amount,
    uint256 _minAmountOut
) external payable returns (uint256 _amountOut);
```

Re-check it against the SDK before a mainnet deploy; the SDK is pre-1.0 and may change.

## How a trade flows

```
packages/portfolio   planRebalance() -> "sell X of A, buy B"
        |
packages/execution   KuruVenue.quote() -> PathFinder.findBestPath()  [Kuru SDK, off-chain]
        |            route = path[].orderbook / isBuy / nativeSend
        |            encodeKuruRoute() -> abi.encode(address[], bool[], bool[])
        v
packages/chain       buildProposal() -> minAmountOut from the ORACLE and the user's mandate
        |                               (never from the venue quote)
        v
RebalanceExecutor    authorise / version / deadline / nonce / slippage floor / venue approved
        |
PortfolioVault       debits the owner, approves the adapter, calls it, re-measures its OWN
        |            balance delta
        v
KuruAdapter          validates the route (allowlisted markets, no native legs),
        |            calls Router.anyToAnySwap, forwards its measured output,
        |            refunds any unspent input
        v
Kuru orderbook  ->  Monad settlement
        |
RebalanceExecutor    POST-TRADE mandate validation; the whole tx reverts if the result is
                     outside the user's policy
```

## Security properties

- **The router address is immutable.** `KuruAdapter` takes it in the constructor and exposes no
  setter, so there is no arbitrary external call target.
- **Markets are allowlisted.** Every leg's market contract must be owner-approved, so a
  compromised proposer cannot route through an unvetted market.
- **Venue quotes never set the slippage floor.** `minAmountOut` is derived on-chain from the
  AssetRegistry oracle and the mandate's `maxSlippageBps`. A bad quote cannot widen the slippage
  the user approved.
- **Accounting comes from balance deltas, twice.** The adapter forwards its own measured output
  rather than the router's return value, and `PortfolioVault` independently re-measures its own
  delta. A misbehaving venue cannot corrupt portfolio accounting.
- **Partial fills cannot strand funds.** Any unspent input is returned to the vault in the same
  transaction.
- **Native (MON) legs are rejected.** Modalis holds ERC-20 portfolio assets, so a `nativeSend`
  leg is always a malformed route here.

## Configuration

```env
KURU_ROUTER_ADDRESS=            # deploy script deploys KuruAdapter when this is set
KURU_MARKET_ADDRESSES=          # comma-separated markets to allowlist on the adapter
KURU_API_URL=                   # PoolFetcher market discovery
NEXT_PUBLIC_KURU_ADAPTER_ADDRESS=   # printed by the deploy script
```

`selectVenue()` in `packages/execution` picks Kuru only when a `KuruAdapter` address, a Kuru API
URL and an RPC URL are all present. Otherwise it returns the demo adapter and says exactly which
variable is missing — it never reports Kuru execution without a Kuru adapter to settle through.

## Verification status

- `KuruAdapter.sol` compiles and its 11 tests pass (`contracts/test/KuruAdapter.t.sol`), driven
  through the full `RebalanceExecutor -> PortfolioVault -> KuruAdapter -> router` path against a
  mock router that implements the **real** `anyToAnySwap` signature.
- The route encoding is asserted to round-trip unchanged from off-chain `abi.encode` to the
  router's calldata.
- **Not yet executed against live Kuru markets.** That needs a Monad RPC endpoint and Kuru market
  addresses, neither of which this build environment can reach. Nothing here claims a Kuru fill
  that has not happened.
