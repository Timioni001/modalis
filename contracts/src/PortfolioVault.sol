// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {PortfolioMandate} from "./PortfolioMandate.sol";
import {IExecutionAdapter} from "./interfaces/IExecutionAdapter.sol";

/// @title PortfolioVault
/// @notice Holds user assets and tracks per-owner balances.
///         - Only the OWNER can withdraw their own balances (withdrawal authority is explicit).
///         - The ONLY other entity that can touch funds is the RebalanceExecutor, and only via
///           `executeTrade`, which can swap through a registry-approved adapter and nothing else.
///         - Withdrawals and emergencyWithdraw keep working while paused.
contract PortfolioVault is Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    AssetRegistry public immutable registry;
    PortfolioMandate public immutable mandate;
    address public executor;

    mapping(address => mapping(address => uint256)) private _balances; // owner => token => amount

    error NOT_EXECUTOR();
    error ZERO_ADDRESS();
    error ZERO_AMOUNT();
    error ASSET_NOT_ENABLED(address token);
    error ASSET_NOT_IN_MANDATE(address token);
    error INSUFFICIENT_BALANCE(address token, uint256 have, uint256 want);
    error ADAPTER_NOT_APPROVED(address adapter);
    error SAME_TOKEN();
    error INSUFFICIENT_OUTPUT(uint256 got, uint256 minOut);
    error ADAPTER_OVERSPEND();

    event Deposited(address indexed owner, address indexed token, uint256 amount);
    event Withdrawn(address indexed owner, address indexed token, uint256 amount);
    event EmergencyWithdrawn(address indexed owner);
    event TradeSettled(
        address indexed owner,
        address indexed adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut
    );
    event ExecutorSet(address indexed executor);

    modifier onlyExecutor() {
        if (msg.sender != executor) revert NOT_EXECUTOR();
        _;
    }

    constructor(address initialOwner, AssetRegistry registry_, PortfolioMandate mandate_) Ownable(initialOwner) {
        registry = registry_;
        mandate = mandate_;
    }

    // ------------------------------------------------------------------ admin

    function setExecutor(address executor_) external onlyOwner {
        if (executor_ == address(0)) revert ZERO_ADDRESS();
        executor = executor_;
        emit ExecutorSet(executor_);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    // ------------------------------------------------------------- user flows

    /// @notice Deposit an asset. Token must be enabled in the registry AND part of the caller's
    ///         mandate, so no funds sit outside the policy's view. Credits the actual amount
    ///         received (fee-on-transfer safe).
    function deposit(address token, uint256 amount) external whenNotPaused nonReentrant {
        if (amount == 0) revert ZERO_AMOUNT();
        if (!registry.isEnabled(token)) revert ASSET_NOT_ENABLED(token);
        if (!mandate.isAllocated(msg.sender, token)) revert ASSET_NOT_IN_MANDATE(token);

        uint256 beforeBal = IERC20(token).balanceOf(address(this));
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        uint256 received = IERC20(token).balanceOf(address(this)) - beforeBal;

        _balances[msg.sender][token] += received;
        emit Deposited(msg.sender, token, received);
    }

    /// @notice Owner-only. Works while paused.
    function withdraw(address token, uint256 amount) external nonReentrant {
        if (amount == 0) revert ZERO_AMOUNT();
        uint256 have = _balances[msg.sender][token];
        if (have < amount) revert INSUFFICIENT_BALANCE(token, have, amount);

        _balances[msg.sender][token] = have - amount;
        IERC20(token).safeTransfer(msg.sender, amount);
        emit Withdrawn(msg.sender, token, amount);
    }

    /// @notice Owner-only exit hatch: returns every registry-listed asset the caller holds.
    ///         Scoped strictly to msg.sender's own balances. Works while paused.
    function emergencyWithdraw() external nonReentrant {
        address[] memory list = registry.listAssets();
        for (uint256 i = 0; i < list.length; i++) {
            uint256 bal = _balances[msg.sender][list[i]];
            if (bal > 0) {
                _balances[msg.sender][list[i]] = 0;
                IERC20(list[i]).safeTransfer(msg.sender, bal);
            }
        }
        emit EmergencyWithdrawn(msg.sender);
    }

    // --------------------------------------------------------- executor flows

    /// @notice Swap `amountIn` of `owner`'s `tokenIn` for `tokenOut` through an approved adapter.
    ///         Accounting is derived from the vault's own balance deltas, never from adapter claims.
    function executeTrade(
        address owner,
        address adapter,
        address tokenIn,
        uint256 amountIn,
        address tokenOut,
        uint256 minAmountOut,
        bytes calldata data
    ) external onlyExecutor whenNotPaused nonReentrant returns (uint256 amountOut) {
        if (!registry.adapterApproved(adapter)) revert ADAPTER_NOT_APPROVED(adapter);
        if (tokenIn == tokenOut) revert SAME_TOKEN();
        if (!registry.isEnabled(tokenIn)) revert ASSET_NOT_ENABLED(tokenIn);
        if (!registry.isEnabled(tokenOut)) revert ASSET_NOT_ENABLED(tokenOut);
        if (!mandate.isAllocated(owner, tokenOut)) revert ASSET_NOT_IN_MANDATE(tokenOut);

        uint256 have = _balances[owner][tokenIn];
        if (have < amountIn) revert INSUFFICIENT_BALANCE(tokenIn, have, amountIn);
        _balances[owner][tokenIn] = have - amountIn;

        uint256 inBefore = IERC20(tokenIn).balanceOf(address(this));
        uint256 outBefore = IERC20(tokenOut).balanceOf(address(this));

        IERC20(tokenIn).forceApprove(adapter, amountIn);
        IExecutionAdapter(adapter).swap(tokenIn, tokenOut, amountIn, minAmountOut, address(this), data);
        IERC20(tokenIn).forceApprove(adapter, 0);

        // The adapter may not spend more than approved.
        if (IERC20(tokenIn).balanceOf(address(this)) + amountIn < inBefore) revert ADAPTER_OVERSPEND();

        amountOut = IERC20(tokenOut).balanceOf(address(this)) - outBefore;
        if (amountOut < minAmountOut) revert INSUFFICIENT_OUTPUT(amountOut, minAmountOut);

        _balances[owner][tokenOut] += amountOut;
        emit TradeSettled(owner, adapter, tokenIn, tokenOut, amountIn, amountOut);
    }

    // ------------------------------------------------------------------ views

    function balanceOf(address owner, address token) external view returns (uint256) {
        return _balances[owner][token];
    }
}
