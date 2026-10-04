// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IExecutionAdapter} from "../interfaces/IExecutionAdapter.sol";
import {AssetRegistry} from "../AssetRegistry.sol";

/// @notice TESTNET / DEMO ONLY. Fills at oracle price less a fixed spread from pre-funded
///         inventory. This is NOT a venue; the real venue is the Kuru adapter. It exists so
///         contract tests and local demos run without external liquidity.
contract MockExecutionAdapter is IExecutionAdapter {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    AssetRegistry public immutable registry;
    uint256 public immutable spreadBps;

    error INSUFFICIENT_OUTPUT(uint256 out, uint256 minOut);

    constructor(AssetRegistry registry_, uint256 spreadBps_) {
        registry = registry_;
        spreadBps = spreadBps_;
    }

    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata
    ) external returns (uint256 amountOut) {
        IERC20(tokenIn).safeTransferFrom(msg.sender, address(this), amountIn);
        amountOut = (registry.convert(tokenIn, tokenOut, amountIn) * (BPS - spreadBps)) / BPS;
        if (amountOut < minAmountOut) revert INSUFFICIENT_OUTPUT(amountOut, minAmountOut);
        IERC20(tokenOut).safeTransfer(recipient, amountOut);
    }
}
