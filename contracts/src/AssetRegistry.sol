// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IPriceOracle} from "./interfaces/IPriceOracle.sol";

/// @title AssetRegistry
/// @notice Whitelist of assets, oracles and execution venues Modalis may touch.
///         Small on purpose: a handful of real assets beats dozens of simulated ones.
contract AssetRegistry is Ownable2Step {
    uint256 internal constant BPS = 10_000;

    struct Asset {
        address token;
        address oracle;
        uint16 maxBps; // global per-asset ceiling, independent of any user mandate
        uint8 decimals;
        bool enabled;
        bool isLiquid; // counts toward the liquidity reserve (stable / cash-like)
        string symbol;
    }

    mapping(address => Asset) private _assets;
    address[] private _list;
    mapping(address => bool) public adapterApproved;

    error ZERO_ADDRESS();
    error ASSET_EXISTS(address token);
    error ASSET_UNKNOWN(address token);
    error BPS_OUT_OF_RANGE(uint256 bps);

    event AssetAdded(address indexed token, string symbol, uint8 decimals, address oracle, uint16 maxBps, bool isLiquid);
    event AssetEnabledSet(address indexed token, bool enabled);
    event AssetMaxBpsSet(address indexed token, uint16 maxBps);
    event AssetOracleSet(address indexed token, address oracle);
    event AdapterApprovalSet(address indexed adapter, bool approved);

    constructor(address initialOwner) Ownable(initialOwner) {}

    // ------------------------------------------------------------------ admin

    function addAsset(address token, address oracle, uint16 maxBps, bool isLiquid, string calldata symbol)
        external
        onlyOwner
    {
        if (token == address(0) || oracle == address(0)) revert ZERO_ADDRESS();
        if (_assets[token].token != address(0)) revert ASSET_EXISTS(token);
        if (maxBps == 0 || maxBps > BPS) revert BPS_OUT_OF_RANGE(maxBps);

        uint8 dec = IERC20Metadata(token).decimals();
        _assets[token] = Asset(token, oracle, maxBps, dec, true, isLiquid, symbol);
        _list.push(token);
        emit AssetAdded(token, symbol, dec, oracle, maxBps, isLiquid);
    }

    function setAssetEnabled(address token, bool enabled) external onlyOwner {
        _requireKnown(token);
        _assets[token].enabled = enabled;
        emit AssetEnabledSet(token, enabled);
    }

    function setAssetMaxBps(address token, uint16 maxBps) external onlyOwner {
        _requireKnown(token);
        if (maxBps == 0 || maxBps > BPS) revert BPS_OUT_OF_RANGE(maxBps);
        _assets[token].maxBps = maxBps;
        emit AssetMaxBpsSet(token, maxBps);
    }

    function setAssetOracle(address token, address oracle) external onlyOwner {
        _requireKnown(token);
        if (oracle == address(0)) revert ZERO_ADDRESS();
        _assets[token].oracle = oracle;
        emit AssetOracleSet(token, oracle);
    }

    function setAdapterApproved(address adapter, bool approved) external onlyOwner {
        if (adapter == address(0)) revert ZERO_ADDRESS();
        adapterApproved[adapter] = approved;
        emit AdapterApprovalSet(adapter, approved);
    }

    // ------------------------------------------------------------------ views

    function getAsset(address token) external view returns (Asset memory) {
        _requireKnown(token);
        return _assets[token];
    }

    function isEnabled(address token) external view returns (bool) {
        return _assets[token].enabled;
    }

    function listAssets() external view returns (address[] memory) {
        return _list;
    }

    /// @notice USD value (1e18) of `amount` base units of `token`.
    function value(address token, uint256 amount) public view returns (uint256) {
        Asset storage a = _assets[token];
        if (a.token == address(0)) revert ASSET_UNKNOWN(token);
        return (amount * IPriceOracle(a.oracle).price(token)) / (10 ** a.decimals);
    }

    /// @notice Oracle-implied amount of `tokenOut` for `amountIn` of `tokenIn`.
    function convert(address tokenIn, address tokenOut, uint256 amountIn) external view returns (uint256) {
        uint256 usd = value(tokenIn, amountIn);
        Asset storage o = _assets[tokenOut];
        if (o.token == address(0)) revert ASSET_UNKNOWN(tokenOut);
        return (usd * (10 ** o.decimals)) / IPriceOracle(o.oracle).price(tokenOut);
    }

    function _requireKnown(address token) internal view {
        if (_assets[token].token == address(0)) revert ASSET_UNKNOWN(token);
    }
}
