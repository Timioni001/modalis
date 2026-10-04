// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Kuru's on-chain router.
/// @dev This is NOT a guess. The signature is transcribed from the `anyToAnySwap` entry of the
///      Router ABI shipped in the official Kuru SDK (npm package kuru-labs/kuru-sdk,
///      abi/Router.json);
///      the full ABI is vendored at `integrations/kuru/abi/Router.json` for provenance, along
///      with the SDK version it came from. Re-check it against the SDK before mainnet use.
///
///      `_marketAddresses` / `_isBuy` / `_nativeSend` describe the route across Kuru orderbook
///      markets. Modalis computes the route off-chain with the SDK's PathFinder and passes it in
///      as adapter data; the adapter never invents a route.
interface IKuruRouter {
    function anyToAnySwap(
        address[] calldata _marketAddresses,
        bool[] calldata _isBuy,
        bool[] calldata _nativeSend,
        address _debitToken,
        address _creditToken,
        uint256 _amount,
        uint256 _minAmountOut
    ) external payable returns (uint256 _amountOut);
}
