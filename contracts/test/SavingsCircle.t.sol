// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SavingsCircle} from "../src/SavingsCircle.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";

contract SavingsCircleTest is Test {
    SavingsCircle circles;
    MockERC20 usd;

    address ada = makeAddr("ada");
    address bayo = makeAddr("bayo");
    address chi = makeAddr("chi");
    address stranger = makeAddr("stranger");

    uint256 constant AMOUNT = 100e18;
    uint64 constant WEEK = 7 days;

    function setUp() public {
        circles = new SavingsCircle();
        usd = new MockERC20("Mock USD", "mUSD", 18);
        address[3] memory people = [ada, bayo, chi];
        for (uint256 i; i < people.length; ++i) {
            usd.mint(people[i], 1_000e18);
            vm.prank(people[i]);
            usd.approve(address(circles), type(uint256).max);
        }
    }

    function _members() internal view returns (address[] memory m) {
        m = new address[](3);
        (m[0], m[1], m[2]) = (ada, bayo, chi);
    }

    function _create() internal returns (uint256 id) {
        vm.prank(ada);
        id = circles.create("Family ajo", IERC20(address(usd)), AMOUNT, WEEK, _members());
    }

    function _round(uint256 id) internal {
        vm.prank(ada);
        circles.contribute(id);
        vm.prank(bayo);
        circles.contribute(id);
        vm.prank(chi);
        circles.contribute(id);
    }

    function test_fullRotationPaysEveryoneOnceInOrder() public {
        uint256 id = _create();

        _round(id); // ada receives
        assertEq(usd.balanceOf(ada), 1_000e18 + 200e18);
        _round(id); // bayo receives
        assertEq(usd.balanceOf(bayo), 1_000e18 + 100e18);
        _round(id); // chi receives, circle completes

        // Over a full rotation everyone paid 300 and received 300.
        assertEq(usd.balanceOf(ada), 1_000e18);
        assertEq(usd.balanceOf(bayo), 1_000e18);
        assertEq(usd.balanceOf(chi), 1_000e18);
        assertEq(usd.balanceOf(address(circles)), 0);

        SavingsCircle.CircleView memory v = circles.getCircle(id);
        assertEq(uint8(v.status), uint8(SavingsCircle.Status.Completed));
        vm.prank(ada);
        vm.expectRevert(SavingsCircle.NOT_ACTIVE.selector);
        circles.contribute(id);
    }

    function test_listsCirclesPerMember() public {
        uint256 id = _create();
        uint256[] memory mine = circles.circlesOf(chi);
        assertEq(mine.length, 1);
        assertEq(mine[0], id);
        assertEq(circles.circlesOf(stranger).length, 0);
    }

    function test_strangerCannotPay() public {
        uint256 id = _create();
        vm.prank(stranger);
        vm.expectRevert(SavingsCircle.NOT_MEMBER.selector);
        circles.contribute(id);
    }

    function test_cannotPayTwiceInARound() public {
        uint256 id = _create();
        vm.startPrank(ada);
        circles.contribute(id);
        vm.expectRevert(SavingsCircle.ALREADY_PAID.selector);
        circles.contribute(id);
        vm.stopPrank();
    }

    function test_missedDeadlineStopsAndRefundsPayers() public {
        uint256 id = _create();
        vm.prank(ada);
        circles.contribute(id);
        vm.prank(bayo);
        circles.contribute(id);

        // Not over yet: nobody can stop it early.
        vm.expectRevert(SavingsCircle.ROUND_NOT_OVER.selector);
        circles.stop(id);

        vm.warp(block.timestamp + WEEK + 1);
        vm.prank(chi);
        vm.expectRevert(SavingsCircle.ROUND_OVER.selector);
        circles.contribute(id);

        vm.prank(ada);
        circles.refund(id); // also stops the circle
        vm.prank(bayo);
        circles.refund(id);
        assertEq(usd.balanceOf(ada), 1_000e18);
        assertEq(usd.balanceOf(bayo), 1_000e18);
        assertEq(usd.balanceOf(address(circles)), 0);

        vm.prank(chi);
        vm.expectRevert(SavingsCircle.NOTHING_TO_REFUND.selector);
        circles.refund(id);
        vm.prank(ada);
        vm.expectRevert(SavingsCircle.NOTHING_TO_REFUND.selector);
        circles.refund(id);
    }

    function test_rejectsBadSetups() public {
        address[] memory one = new address[](1);
        one[0] = ada;
        vm.prank(ada);
        vm.expectRevert(SavingsCircle.BAD_MEMBERS.selector);
        circles.create("x", IERC20(address(usd)), AMOUNT, WEEK, one);

        address[] memory dup = new address[](2);
        (dup[0], dup[1]) = (ada, ada);
        vm.prank(ada);
        vm.expectRevert(abi.encodeWithSelector(SavingsCircle.DUPLICATE_MEMBER.selector, ada));
        circles.create("x", IERC20(address(usd)), AMOUNT, WEEK, dup);

        // The creator must be one of the members.
        vm.prank(stranger);
        vm.expectRevert(SavingsCircle.BAD_MEMBERS.selector);
        circles.create("x", IERC20(address(usd)), AMOUNT, WEEK, _members());

        vm.prank(ada);
        vm.expectRevert(SavingsCircle.ZERO_AMOUNT.selector);
        circles.create("x", IERC20(address(usd)), 0, WEEK, _members());

        vm.prank(ada);
        vm.expectRevert(SavingsCircle.ROUND_TOO_SHORT.selector);
        circles.create("x", IERC20(address(usd)), AMOUNT, 10, _members());
    }

    function test_viewShowsWhoPaid() public {
        uint256 id = _create();
        vm.prank(bayo);
        circles.contribute(id);
        SavingsCircle.CircleView memory v = circles.getCircle(id);
        assertEq(v.paidCount, 1);
        assertFalse(v.paidThisRound[0]);
        assertTrue(v.paidThisRound[1]);
        assertEq(v.members[2], chi);
        assertEq(v.name, "Family ajo");
    }
}
