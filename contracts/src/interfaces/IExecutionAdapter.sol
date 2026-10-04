// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Execution venues (Kuru, mock, future venues) implement this. The vault approves
///         `amountIn` of `tokenIn` to the adapter, calls `swap`, and verifies its own balance
///         delta of `tokenOut`; adapters are therefore never trusted for accounting.
interface IExecutionAdapter {
    function swap(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 minAmountOut,
        address recipient,
        bytes calldata data
    ) external returns (uint256 amountOut);
}
