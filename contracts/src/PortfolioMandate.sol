// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AssetRegistry} from "./AssetRegistry.sol";

/// @title PortfolioMandate
/// @notice The user's investment policy, stored as machine-enforceable rules.
///         The contract stores the RULES, never the model. One mandate per owner (MVP).
///         Only the owner can change their mandate; the manager (AI/risk service) can never.
contract PortfolioMandate {
    uint256 internal constant BPS = 10_000;

    struct MandateParams {
        uint256 targetValue; // USD, 1e18
        uint64 targetDate; // unix seconds
        uint16 maxDrawdownBps;
        uint16 minLiquidityBps;
        uint16 rebalanceThresholdBps;
        uint16 maxSingleAssetBps; // applies to non-liquid assets
        uint16 maxSlippageBps;
    }

    struct Mandate {
        uint256 targetValue;
        uint64 targetDate;
        uint16 maxDrawdownBps;
        uint16 minLiquidityBps;
        uint16 rebalanceThresholdBps;
        uint16 maxSingleAssetBps;
        uint16 maxSlippageBps;
        bool active;
        uint32 version; // 0 = no mandate
    }

    struct Allocation {
        address token;
        uint16 targetBps;
        uint16 minBps;
        uint16 maxBps;
    }

    AssetRegistry public immutable registry;

    mapping(address => Mandate) private _mandates;
    mapping(address => Allocation[]) private _allocations;
    mapping(address => address) private _manager;

    // Named to match the revert strings shown in the demo.
    error MAX_ALLOCATION_EXCEEDED(address token, uint256 bps, uint256 limitBps);
    error ALLOCATION_BELOW_MIN(address token, uint256 bps, uint256 minBps);
    error ALLOCATION_ABOVE_RANGE(address token, uint256 bps, uint256 maxBps);
    error MIN_LIQUIDITY_BREACHED(uint256 liquidBps, uint256 minBps);
    error VALUES_LENGTH_MISMATCH();
    error NO_MANDATE();
    error TARGETS_NOT_100_PERCENT(uint256 sum);
    error BPS_OUT_OF_RANGE(uint256 bps);
    error INVALID_TARGET();
    error INVALID_TARGET_DATE();
    error INVALID_RANGE(address token);
    error ASSET_NOT_ENABLED(address token);
    error DUPLICATE_ASSET(address token);
    error LIQUIDITY_TARGET_TOO_LOW(uint256 liquidTargetBps, uint256 minLiquidityBps);
    error EMPTY_ALLOCATIONS();
    error ZERO_ADDRESS();

    event MandateUpdated(address indexed owner, uint32 indexed version, MandateParams params);
    event AllocationSet(
        address indexed owner, uint32 indexed version, address token, uint16 targetBps, uint16 minBps, uint16 maxBps
    );
    event MandateActiveSet(address indexed owner, uint32 indexed version, bool active);
    event ManagerSet(address indexed owner, address indexed manager);

    constructor(AssetRegistry registry_) {
        registry = registry_;
    }

    // ------------------------------------------------------------ owner actions

    /// @notice Create or replace the caller's mandate. Bumps the version, which invalidates
    ///         any in-flight rebalance proposals built against the previous version.
    function setMandate(MandateParams calldata p, Allocation[] calldata allocs) external {
        _validateParams(p);
        uint256 liquidTarget = _validateAllocations(p, allocs);
        if (liquidTarget < p.minLiquidityBps) revert LIQUIDITY_TARGET_TOO_LOW(liquidTarget, p.minLiquidityBps);

        Mandate storage m = _mandates[msg.sender];
        uint32 newVersion = m.version + 1;

        m.targetValue = p.targetValue;
        m.targetDate = p.targetDate;
        m.maxDrawdownBps = p.maxDrawdownBps;
        m.minLiquidityBps = p.minLiquidityBps;
        m.rebalanceThresholdBps = p.rebalanceThresholdBps;
        m.maxSingleAssetBps = p.maxSingleAssetBps;
        m.maxSlippageBps = p.maxSlippageBps;
        m.active = true;
        m.version = newVersion;

        delete _allocations[msg.sender];
        emit MandateUpdated(msg.sender, newVersion, p);
        for (uint256 i = 0; i < allocs.length; i++) {
            _allocations[msg.sender].push(allocs[i]);
            emit AllocationSet(
                msg.sender, newVersion, allocs[i].token, allocs[i].targetBps, allocs[i].minBps, allocs[i].maxBps
            );
        }
    }

    function setActive(bool active) external {
        Mandate storage m = _mandates[msg.sender];
        if (m.version == 0) revert NO_MANDATE();
        m.active = active;
        emit MandateActiveSet(msg.sender, m.version, active);
    }

    /// @notice Authorise a manager (the Modalis risk/execution service) to submit rebalance
    ///         proposals for the caller. The manager has NO withdrawal or mandate authority.
    function setManager(address manager) external {
        _manager[msg.sender] = manager; // address(0) revokes
        emit ManagerSet(msg.sender, manager);
    }

    // ------------------------------------------------------------------ views

    function mandateOf(address owner) external view returns (Mandate memory) {
        return _mandates[owner];
    }

    function allocationsOf(address owner) external view returns (Allocation[] memory) {
        return _allocations[owner];
    }

    function allocationTokens(address owner) external view returns (address[] memory tokens) {
        Allocation[] storage a = _allocations[owner];
        tokens = new address[](a.length);
        for (uint256 i = 0; i < a.length; i++) {
            tokens[i] = a[i].token;
        }
    }

    function isAllocated(address owner, address token) external view returns (bool) {
        Allocation[] storage a = _allocations[owner];
        for (uint256 i = 0; i < a.length; i++) {
            if (a[i].token == token) return true;
        }
        return false;
    }

    function managerOf(address owner) external view returns (address) {
        return _manager[owner];
    }

    /// @notice Core enforcement. `values[i]` is the USD value (1e18) of the owner's holding of
    ///         allocation token i (same order as `allocationsOf`). Reverts if the portfolio
    ///         would violate the mandate. This is the check the AI can never bypass.
    function validate(address owner, uint256[] calldata values) external view {
        Mandate storage m = _mandates[owner];
        if (m.version == 0) revert NO_MANDATE();
        Allocation[] storage allocs = _allocations[owner];
        if (values.length != allocs.length) revert VALUES_LENGTH_MISMATCH();

        uint256 total;
        for (uint256 i = 0; i < values.length; i++) {
            total += values[i];
        }
        if (total == 0) return; // empty portfolio cannot breach anything

        uint256 liquidValue;
        for (uint256 i = 0; i < values.length; i++) {
            Allocation storage a = allocs[i];
            AssetRegistry.Asset memory asset = registry.getAsset(a.token);
            uint256 bps = (values[i] * BPS) / total;

            if (asset.isLiquid) {
                liquidValue += values[i];
            } else if (bps > m.maxSingleAssetBps) {
                revert MAX_ALLOCATION_EXCEEDED(a.token, bps, m.maxSingleAssetBps);
            }
            if (bps > asset.maxBps) revert MAX_ALLOCATION_EXCEEDED(a.token, bps, asset.maxBps);
            if (bps > a.maxBps) revert ALLOCATION_ABOVE_RANGE(a.token, bps, a.maxBps);
            if (bps < a.minBps) revert ALLOCATION_BELOW_MIN(a.token, bps, a.minBps);
        }

        uint256 liquidBps = (liquidValue * BPS) / total;
        if (liquidBps < m.minLiquidityBps) revert MIN_LIQUIDITY_BREACHED(liquidBps, m.minLiquidityBps);
    }

    // --------------------------------------------------------------- internals

    function _validateParams(MandateParams calldata p) internal view {
        if (p.targetValue == 0) revert INVALID_TARGET();
        if (p.targetDate <= block.timestamp) revert INVALID_TARGET_DATE();
        if (
            p.maxDrawdownBps > BPS || p.minLiquidityBps > BPS || p.rebalanceThresholdBps > BPS
                || p.maxSingleAssetBps == 0 || p.maxSingleAssetBps > BPS || p.maxSlippageBps > BPS
        ) revert BPS_OUT_OF_RANGE(0);
    }

    /// @return liquidTarget sum of target bps across liquid assets
    function _validateAllocations(MandateParams calldata p, Allocation[] calldata allocs)
        internal
        view
        returns (uint256 liquidTarget)
    {
        if (allocs.length == 0) revert EMPTY_ALLOCATIONS();
        uint256 sum;
        for (uint256 i = 0; i < allocs.length; i++) {
            Allocation calldata a = allocs[i];
            if (a.token == address(0)) revert ZERO_ADDRESS();
            if (!registry.isEnabled(a.token)) revert ASSET_NOT_ENABLED(a.token);
            if (a.maxBps > BPS || a.minBps > a.targetBps || a.targetBps > a.maxBps) revert INVALID_RANGE(a.token);

            for (uint256 j = 0; j < i; j++) {
                if (allocs[j].token == a.token) revert DUPLICATE_ASSET(a.token);
            }

            AssetRegistry.Asset memory asset = registry.getAsset(a.token);
            if (asset.isLiquid) {
                liquidTarget += a.targetBps;
            } else if (a.targetBps > p.maxSingleAssetBps) {
                revert MAX_ALLOCATION_EXCEEDED(a.token, a.targetBps, p.maxSingleAssetBps);
            }
            sum += a.targetBps;
        }
        if (sum != BPS) revert TARGETS_NOT_100_PERCENT(sum);
    }
}
