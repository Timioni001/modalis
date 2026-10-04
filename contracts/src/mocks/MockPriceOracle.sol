// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IPriceOracle} from "../interfaces/IPriceOracle.sol";

/// @notice TESTNET / DEMO ONLY. Owner-pushed prices with a staleness window. Used to create the
///         controlled "market movement" in the demo; the label in the UI must say so.
contract MockPriceOracle is IPriceOracle, Ownable {
    struct Quote {
        uint192 priceE18;
        uint64 updatedAt;
    }

    mapping(address => Quote) public quotes;
    uint256 public maxAge;

    error PRICE_UNAVAILABLE(address token);
    error PRICE_STALE(address token, uint256 updatedAt);

    event PriceSet(address indexed token, uint256 priceE18);

    constructor(address initialOwner, uint256 maxAge_) Ownable(initialOwner) {
        maxAge = maxAge_;
    }

    function setMaxAge(uint256 maxAge_) external onlyOwner {
        maxAge = maxAge_;
    }

    function setPrice(address token, uint256 priceE18) external onlyOwner {
        require(priceE18 > 0 && priceE18 <= type(uint192).max, "BAD_PRICE");
        quotes[token] = Quote(uint192(priceE18), uint64(block.timestamp));
        emit PriceSet(token, priceE18);
    }

    function price(address token) external view returns (uint256) {
        Quote memory q = quotes[token];
        if (q.priceE18 == 0) revert PRICE_UNAVAILABLE(token);
        if (block.timestamp - q.updatedAt > maxAge) revert PRICE_STALE(token, q.updatedAt);
        return q.priceE18;
    }
}
