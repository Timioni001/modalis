// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {AssetRegistry} from "./AssetRegistry.sol";
import {PortfolioMandate} from "./PortfolioMandate.sol";
import {PortfolioVault} from "./PortfolioVault.sol";

/// @title RebalanceExecutor
/// @notice THE enforcement point: AI proposes -> this contract checks -> vault settles.
///         Pipeline: authorise -> mandate active/version -> expiry -> nonce -> slippage ->
///         approved venue (vault) -> execute -> post-trade mandate validation -> emit.
///         A proposal that leaves the portfolio outside the mandate reverts the whole tx.
contract RebalanceExecutor is Ownable2Step, Pausable, ReentrancyGuard {
    uint256 internal constant BPS = 10_000;

    struct Proposal {
        address owner; // portfolio owner
        address adapter; // execution venue (must be registry-approved)
        address tokenIn; // sell
        address tokenOut; // buy
        uint256 amountIn;
        uint256 minAmountOut;
        uint256 deadline;
        uint32 mandateVersion; // must equal the live mandate version (anti-stale)
        uint256 nonce; // must equal nextNonce[owner] (anti-replay)
        bytes32 reasonHash; // keccak256 of the human-readable explanation stored offchain
    }

    AssetRegistry public immutable registry;
    PortfolioMandate public immutable mandate;
    PortfolioVault public immutable vault;

    mapping(address => uint256) public nextNonce;

    error NOT_AUTHORIZED();
    error MANDATE_INACTIVE();
    error STALE_MANDATE_VERSION(uint32 proposed, uint32 live);
    error PROPOSAL_EXPIRED(uint256 deadline, uint256 nowTs);
    error INVALID_NONCE(uint256 given, uint256 expected);
    error SLIPPAGE_TOO_LOOSE(uint256 minAmountOut, uint256 minAllowed);

    event Rebalanced(
        address indexed owner,
        uint32 indexed mandateVersion,
        uint256 indexed nonce,
        address adapter,
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint256 amountOut,
        bytes32 reasonHash
    );
    /// @dev before/after allocation in bps, aligned with `tokens` (mandate allocation order).
    event AllocationSnapshot(
        address indexed owner, uint256 indexed nonce, address[] tokens, uint256[] bpsBefore, uint256[] bpsAfter
    );

    constructor(address initialOwner, AssetRegistry registry_, PortfolioMandate mandate_, PortfolioVault vault_)
        Ownable(initialOwner)
    {
        registry = registry_;
        mandate = mandate_;
        vault = vault_;
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Submit a rebalance. Callable by the portfolio owner or their authorised manager.
    function execute(Proposal calldata p, bytes calldata adapterData)
        external
        whenNotPaused
        nonReentrant
        returns (uint256 amountOut)
    {
        _authorise(p);
        _checkSlippage(p);

        (uint256[] memory valuesBefore, uint256 totalBefore) = _values(p.owner);

        amountOut =
            vault.executeTrade(p.owner, p.adapter, p.tokenIn, p.amountIn, p.tokenOut, p.minAmountOut, adapterData);

        (uint256[] memory valuesAfter, uint256 totalAfter) = _values(p.owner);
        mandate.validate(p.owner, valuesAfter); // <-- the AI is not the security boundary; this is.

        _emitRebalanced(p, amountOut);
        emit AllocationSnapshot(
            p.owner,
            p.nonce,
            mandate.allocationTokens(p.owner),
            _toBps(valuesBefore, totalBefore),
            _toBps(valuesAfter, totalAfter)
        );
    }

    /// @notice Current portfolio valued in USD (1e18), aligned with the mandate's allocation order.
    ///         Read by the CRE risk workflow and the dashboard.
    function portfolioState(address owner)
        external
        view
        returns (address[] memory tokens, uint256[] memory values, uint256 total)
    {
        tokens = mandate.allocationTokens(owner);
        (values, total) = _values(owner);
    }

    // --------------------------------------------------------------- internals

    function _authorise(Proposal calldata p) internal {
        PortfolioMandate.Mandate memory m = mandate.mandateOf(p.owner);
        address mgr = mandate.managerOf(p.owner);
        if (msg.sender != p.owner && (mgr == address(0) || msg.sender != mgr)) revert NOT_AUTHORIZED();
        if (m.version == 0 || !m.active) revert MANDATE_INACTIVE();
        if (p.mandateVersion != m.version) revert STALE_MANDATE_VERSION(p.mandateVersion, m.version);
        if (block.timestamp > p.deadline) revert PROPOSAL_EXPIRED(p.deadline, block.timestamp);
        uint256 expected = nextNonce[p.owner];
        if (p.nonce != expected) revert INVALID_NONCE(p.nonce, expected);
        nextNonce[p.owner] = expected + 1;
    }

    /// @dev Proposer-supplied minAmountOut must be no looser than oracle value less the mandate's
    ///      max slippage, so a compromised manager cannot sandbag the trade.
    function _checkSlippage(Proposal calldata p) internal view {
        uint16 maxSlippageBps = mandate.mandateOf(p.owner).maxSlippageBps;
        uint256 expectedOut = registry.convert(p.tokenIn, p.tokenOut, p.amountIn);
        uint256 minAllowed = (expectedOut * (BPS - maxSlippageBps)) / BPS;
        if (p.minAmountOut < minAllowed) revert SLIPPAGE_TOO_LOOSE(p.minAmountOut, minAllowed);
    }

    function _emitRebalanced(Proposal calldata p, uint256 amountOut) internal {
        emit Rebalanced(
            p.owner, p.mandateVersion, p.nonce, p.adapter, p.tokenIn, p.tokenOut, p.amountIn, amountOut, p.reasonHash
        );
    }

    function _values(address owner) internal view returns (uint256[] memory values, uint256 total) {
        address[] memory tokens = mandate.allocationTokens(owner);
        values = new uint256[](tokens.length);
        for (uint256 i = 0; i < tokens.length; i++) {
            values[i] = registry.value(tokens[i], vault.balanceOf(owner, tokens[i]));
            total += values[i];
        }
    }

    function _toBps(uint256[] memory values, uint256 total) internal pure returns (uint256[] memory bps) {
        bps = new uint256[](values.length);
        if (total == 0) return bps;
        for (uint256 i = 0; i < values.length; i++) {
            bps[i] = (values[i] * BPS) / total;
        }
    }
}
