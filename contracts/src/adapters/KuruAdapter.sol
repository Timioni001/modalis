// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IExecutionAdapter} from "../interfaces/IExecutionAdapter.sol";
import {IKuruRouter} from "../interfaces/IKuruRouter.sol";

/// @title KuruAdapter
/// @notice Routes Modalis portfolio trades through Kuru's on-chain orderbook.
///
///         Modalis is the portfolio manager; Kuru is the execution venue. The portfolio engine
///         decides "reduce A by 7%, increase B by 7%"; this adapter decides nothing about the
///         portfolio and only settles that instruction.
///
/// Security posture:
///   - The router address is IMMUTABLE. There is no arbitrary external call target here.
///   - Every market in the route must be owner-allowlisted, so a compromised proposer cannot
///     route through an unvetted market contract.
///   - The adapter forwards its own measured balance delta of `tokenOut`, never the router's
///     claimed return value. PortfolioVault then independently re-measures its own delta, so
///     accounting survives a misbehaving venue.
///   - Any unspent `tokenIn` is returned to the caller in the same transaction, so a partial
///     fill cannot leave user funds stranded in the adapter.
contract KuruAdapter is IExecutionAdapter, Ownable2Step {
    using SafeERC20 for IERC20;

    IKuruRouter public immutable router;

    /// @notice Kuru market contracts this adapter may route through.
    mapping(address => bool) public marketAllowed;

    error ZERO_ADDRESS();
    error EMPTY_ROUTE();
    error ROUTE_LENGTH_MISMATCH(uint256 markets, uint256 isBuy, uint256 nativeSend);
    error MARKET_NOT_ALLOWED(address market);
    error NATIVE_SEND_UNSUPPORTED();
    error INSUFFICIENT_OUTPUT(uint256 amountOut, uint256 minAmountOut);
    error SAME_TOKEN();

    event MarketAllowedSet(address indexed market, bool allowed);
    event KuruSwap(
        address indexed caller,
        address indexed tokenIn,
        address indexed tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        uint256 refunded
    );

    constructor(address initialOwner, IKuruRouter router_) Ownable(initialOwner) {
        if (address(router_) == address(0)) revert ZERO_ADDRESS();
        router = router_;
    }

    // ------------------------------------------------------------------ admin

    function setMarketAllowed(address market, bool allowed) external onlyOwner {
        if (market == address(0)) revert ZERO_ADDRESS();
        marketAllowed[market] = allowed;
        emit MarketAllowedSet(market, allowed);
    }

    function setMarketsAllowed(address[] calldata markets, bool allowed) external onlyOwner {
        for (uint256 i = 0; i < markets.length; i++) {
            if (markets[i] == address(0)) revert ZERO_ADDRESS();
            marketAllowed[markets[i]] = allowed;
            emit MarketAllowedSet(markets[i], allowed);
        }
    }

    // ------------------------------------------------------------------ swap

    /// @inheritdoc IExecutionAdapter
    /// @param data abi.encode(address[] marketAddresses, bool[] isBuy, bool[] nativeSend) — the
    ///        route computed off-chain by the Kuru SDK's PathFinder.
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external override returns (uint256 amountOut) {
        if (tokenIn == tokenOut) revert SAME_TOKEN();
        if (recipient == address(0)) revert ZERO_ADDRESS();

        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);

        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));
        // The adapter's own pre-existing inventory of tokenIn, excluding the amount just pulled in.
        uint256 inBaseline = IERC20(tokenIn).balanceOf(address(this)) - amountIn;

        _routeThroughKuru(tokenIn, tokenOut, amountIn, minAmountOut, data);

        // Trust our own balances, not the router's return value.
        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < minAmountOut) revert INSUFFICIENT_OUTPUT(amountOut, minAmountOut);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);

        uint256 refunded = _refundUnspent(tokenIn, inBaseline);
        emit KuruSwap(msg.sender, tokenIn, tokenOut, amountIn, amountOut, refunded);
    }

    /// @dev Decodes and validates the route, then performs the single external call to Kuru.
    ///      Kept in its own frame so `swap` stays within the EVM stack limit.
    function _routeThroughKuru(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        bytes calldata data
    ) internal {
        (address[] memory markets, bool[] memory isBuy, bool[] memory nativeSend) =
            abi.decode(data, (address[], bool[], bool[]));
        _validateRoute(markets, isBuy, nativeSend);

        IERC20(tokenIn).forceApprove(address(router), amountIn);
        router.anyToAnySwap(markets, isBuy, nativeSend, tokenIn, tokenOut, amountIn, minAmountOut);
        IERC20(tokenIn).forceApprove(address(router), 0);
    }

    /// @dev Returns anything the route did not spend, so a partial fill never strands user funds.
    function _refundUnspent(address tokenIn, uint256 inBaseline) internal returns (uint256 refunded) {
        uint256 inAfter = IERC20(tokenIn).balanceOf(address(this));
        if (inAfter > inBaseline) {
            refunded = inAfter - inBaseline;
            IERC20(tokenIn).safeTransfer(msg.sender, refunded);
        }
    }

    function _validateRoute(address[] memory markets, bool[] memory isBuy, bool[] memory nativeSend) internal view {
        if (markets.length == 0) revert EMPTY_ROUTE();
        if (markets.length != isBuy.length || markets.length != nativeSend.length) {
            revert ROUTE_LENGTH_MISMATCH(markets.length, isBuy.length, nativeSend.length);
        }
        for (uint256 i = 0; i < markets.length; i++) {
            if (!marketAllowed[markets[i]]) revert MARKET_NOT_ALLOWED(markets[i]);
            // Modalis holds ERC-20 portfolio assets, never native MON, so a route leg asking the
            // router to spend native value is always a malformed route for this adapter.
            if (nativeSend[i]) revert NATIVE_SEND_UNSUPPORTED();
        }
    }
}
