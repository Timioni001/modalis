// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";

/// @notice Receiver interface used by Chainlink CRE forwarders.
/// @dev VERIFY against the current CRE docs (https://docs.chain.link/cre) before deploying:
///      the report encoding, metadata layout and forwarder address for Monad are version-specific.
interface IReceiver is IERC165 {
    function onReport(bytes calldata metadata, bytes calldata report) external;
}

/// @title RiskSignalReceiver
/// @notice Records risk state published by the CRE monitoring workflow. It is a SIGNAL ONLY:
///         it never moves funds. Rebalancing still requires a proposal that passes the
///         RebalanceExecutor's mandate validation. (Do not claim autonomous fund movement
///         through CRE unless that exact path is built and tested.)
contract RiskSignalReceiver is IReceiver, Ownable2Step {
    enum RiskStatus {
        OK, // within mandate
        DRIFT, // drift above rebalance threshold
        BREACH // hard mandate boundary breached
    }

    struct RiskState {
        RiskStatus status;
        uint32 mandateVersion;
        uint64 updatedAt;
        uint256 maxDriftBps;
        uint256 totalValue; // USD 1e18
        bytes32 reasonHash;
    }

    address public forwarder;
    mapping(address => RiskState) public latest;

    error NOT_FORWARDER();
    error ZERO_ADDRESS();
    error BAD_STATUS(uint8 status);

    event RiskStateUpdated(
        address indexed owner,
        RiskStatus status,
        uint32 mandateVersion,
        uint256 maxDriftBps,
        uint256 totalValue,
        bytes32 reasonHash
    );
    event RebalanceRequired(address indexed owner, RiskStatus status, uint32 mandateVersion, bytes32 reasonHash);
    event ForwarderSet(address indexed forwarder);

    constructor(address initialOwner, address forwarder_) Ownable(initialOwner) {
        if (forwarder_ == address(0)) revert ZERO_ADDRESS();
        forwarder = forwarder_;
    }

    function setForwarder(address forwarder_) external onlyOwner {
        if (forwarder_ == address(0)) revert ZERO_ADDRESS();
        forwarder = forwarder_;
        emit ForwarderSet(forwarder_);
    }

    /// @dev report = abi.encode(address owner, uint8 status, uint32 mandateVersion,
    ///                          uint256 maxDriftBps, uint256 totalValue, bytes32 reasonHash)
    function onReport(bytes calldata, bytes calldata report) external override {
        if (msg.sender != forwarder) revert NOT_FORWARDER();
        (address owner, uint8 status, uint32 version, uint256 drift, uint256 total, bytes32 reason) =
            abi.decode(report, (address, uint8, uint32, uint256, uint256, bytes32));
        if (status > uint8(RiskStatus.BREACH)) revert BAD_STATUS(status);

        RiskStatus s = RiskStatus(status);
        latest[owner] = RiskState(s, version, uint64(block.timestamp), drift, total, reason);
        emit RiskStateUpdated(owner, s, version, drift, total, reason);
        if (s != RiskStatus.OK) emit RebalanceRequired(owner, s, version, reason);
    }

    function supportsInterface(bytes4 interfaceId) external pure override returns (bool) {
        return interfaceId == type(IReceiver).interfaceId || interfaceId == type(IERC165).interfaceId;
    }
}
