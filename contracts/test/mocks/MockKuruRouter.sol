// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IKuruRouter} from "../../src/interfaces/IKuruRouter.sol";
import {AssetRegistry} from "../../src/AssetRegistry.sol";

/// @notice TEST ONLY. Stands in for Kuru's router so KuruAdapter can be tested without a live
///         Monad fork. It implements the REAL `anyToAnySwap` signature (taken from the Kuru SDK's
///         Router ABI) so the adapter's calldata encoding is exercised exactly as in production.
///         It is not deployed by any script and is deliberately not in src/.
contract MockKuruRouter is IKuruRouter {
    using SafeERC20 for IERC20;

    uint256 internal constant BPS = 10_000;

    AssetRegistry public immutable registry;

    /// @dev Fraction of `_amount` the router actually pulls. < BPS simulates a partial fill.
    uint256 public spendBps = BPS;
    /// @dev Fraction of the oracle-implied output the router actually delivers.
    uint256 public fillBps = 9_990; // 10 bps of venue spread

    /// @dev Records the route it was called with, so tests can assert the encoding round-trips.
    address[] public lastMarkets;
    bool[] public lastIsBuy;
    bool[] public lastNativeSend;

    constructor(AssetRegistry registry_) {
        registry = registry_;
    }

    function setSpendBps(uint256 v) external {
        spendBps = v;
    }

    function setFillBps(uint256 v) external {
        fillBps = v;
    }

    function lastRouteLength() external view returns (uint256) {
        return lastMarkets.length;
    }

    function anyToAnySwap(
        address[] calldata _marketAddresses,
        bool[] calldata _isBuy,
        bool[] calldata _nativeSend,
        address _debitToken,
        address _creditToken,
        uint256 _amount,
        uint256 _minAmountOut
    ) external payable override returns (uint256 _amountOut) {
        lastMarkets = _marketAddresses;
        lastIsBuy = _isBuy;
        lastNativeSend = _nativeSend;

        uint256 spend = (_amount * spendBps) / BPS;
        IERC20(_debitToken).safeTransferFrom(msg.sender, address(this), spend);

        _amountOut = (registry.convert(_debitToken, _creditToken, spend) * fillBps) / BPS;
        require(_amountOut >= _minAmountOut, "KURU_SLIPPAGE");
        IERC20(_creditToken).safeTransfer(msg.sender, _amountOut);
    }
}
