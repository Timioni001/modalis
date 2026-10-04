// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IPriceOracle {
    /// @return priceE18 USD price of ONE WHOLE token, scaled by 1e18. MUST revert if stale/unavailable.
    function price(address token) external view returns (uint256 priceE18);
}
