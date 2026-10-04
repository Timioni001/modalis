// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {RiskSignalReceiver, IReceiver} from "../src/RiskSignalReceiver.sol";

/// @notice Proves the Chainlink CRE workflow's report payload decodes correctly in the contract
///         that receives it.
///
///         The hex blob below was produced by `encodeRiskReport` in
///         integrations/chainlink-cre/src/abi.ts, not written by hand. If the workflow's encoding
///         and this contract's decoding ever drift apart, this test fails — which is the only way
///         to catch that mismatch without a live DON.
contract RiskSignalReceiverTest is Test {
    RiskSignalReceiver receiver;

    address forwarder = makeAddr("creForwarder");
    address stranger = makeAddr("stranger");
    address owner = 0x70997970C51812dc3A010C7d01b50e0d17dc79C8;

    /// abi.encode(owner, status=2 (BREACH), version=1, maxDriftBps=694, totalValue=11031.67e18,
    ///            keccak256("MAX_ALLOCATION_EXCEEDED:mBTC:3274/3000"))
    bytes constant CRE_PAYLOAD =
        hex"00000000000000000000000070997970c51812dc3a010c7d01b50e0d17dc79c8"
        hex"0000000000000000000000000000000000000000000000000000000000000002"
        hex"0000000000000000000000000000000000000000000000000000000000000001"
        hex"00000000000000000000000000000000000000000000000000000000000002b6"
        hex"000000000000000000000000000000000000000000000256072ce8b5157f0000"
        hex"b10aa359710b7d94285ef7ea054836f284383de54956656d303a34441f05a5a7";

    function setUp() public {
        vm.warp(1_700_000_000);
        receiver = new RiskSignalReceiver(address(this), forwarder);
    }

    function test_decodesTheWorkflowsPayload() public {
        vm.prank(forwarder);
        receiver.onReport("", CRE_PAYLOAD);

        (
            RiskSignalReceiver.RiskStatus status,
            uint32 version,
            uint64 updatedAt,
            uint256 maxDriftBps,
            uint256 totalValue,
            bytes32 reasonHash
        ) = receiver.latest(owner);

        assertEq(uint8(status), uint8(RiskSignalReceiver.RiskStatus.BREACH), "status");
        assertEq(version, 1, "mandate version");
        assertEq(updatedAt, uint64(block.timestamp), "timestamp");
        assertEq(maxDriftBps, 694, "max drift");
        assertEq(totalValue, 11_031_670_000_000_000_000_000, "total value");
        assertEq(reasonHash, keccak256("MAX_ALLOCATION_EXCEEDED:mBTC:3274/3000"), "reason hash");
    }

    function test_breachAlsoEmitsRebalanceRequired() public {
        vm.prank(forwarder);
        vm.expectEmit(true, false, false, true, address(receiver));
        emit RiskSignalReceiver.RebalanceRequired(
            owner,
            RiskSignalReceiver.RiskStatus.BREACH,
            1,
            keccak256("MAX_ALLOCATION_EXCEEDED:mBTC:3274/3000")
        );
        receiver.onReport("", CRE_PAYLOAD);
    }

    function test_okStatusDoesNotRequestRebalance() public {
        bytes memory ok = abi.encode(owner, uint8(0), uint32(1), uint256(120), uint256(1e18), bytes32("ok"));
        vm.recordLogs();
        vm.prank(forwarder);
        receiver.onReport("", ok);

        // Only RiskStateUpdated: an OK state must not ask for a rebalance.
        assertEq(vm.getRecordedLogs().length, 1, "expected exactly one event");
    }

    function test_onlyForwarderCanPublish() public {
        vm.prank(stranger);
        vm.expectRevert(RiskSignalReceiver.NOT_FORWARDER.selector);
        receiver.onReport("", CRE_PAYLOAD);
    }

    function test_rejectsAnOutOfRangeStatus() public {
        bytes memory bad = abi.encode(owner, uint8(7), uint32(1), uint256(0), uint256(0), bytes32(0));
        vm.prank(forwarder);
        vm.expectPartialRevert(RiskSignalReceiver.BAD_STATUS.selector);
        receiver.onReport("", bad);
    }

    /// The receiver is a signal sink only: it must expose nothing that can move funds.
    function test_receiverHasNoFundAuthority() public view {
        assertTrue(receiver.supportsInterface(type(IReceiver).interfaceId), "must advertise IReceiver");
        // The only state it writes is the risk record; it holds no token balances and has no
        // reference to the vault or executor at all.
        assertEq(address(receiver).balance, 0);
    }
}
