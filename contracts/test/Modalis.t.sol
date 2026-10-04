// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PortfolioMandate} from "../src/PortfolioMandate.sol";
import {PortfolioVault} from "../src/PortfolioVault.sol";
import {RebalanceExecutor} from "../src/RebalanceExecutor.sol";
import {RiskSignalReceiver} from "../src/RiskSignalReceiver.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockExecutionAdapter} from "../src/mocks/MockExecutionAdapter.sol";

contract ModalisTest is Test {
    AssetRegistry registry;
    PortfolioMandate mandate;
    PortfolioVault vault;
    RebalanceExecutor executor;
    MockPriceOracle oracle;
    MockExecutionAdapter adapter;

    MockERC20 mUSD; // 6 dec,  $1      (liquid)
    MockERC20 mBTC; // 8 dec,  $50,000
    MockERC20 mETH; // 18 dec, $2,500
    MockERC20 mBOND; // 18 dec, $100

    address user = makeAddr("user");
    address manager = makeAddr("manager");
    address stranger = makeAddr("stranger");

    function setUp() public {
        vm.warp(1_700_000_000);

        oracle = new MockPriceOracle(address(this), 1 days);
        registry = new AssetRegistry(address(this));
        mandate = new PortfolioMandate(registry);
        vault = new PortfolioVault(address(this), registry, mandate);
        executor = new RebalanceExecutor(address(this), registry, mandate, vault);
        vault.setExecutor(address(executor));

        mUSD = new MockERC20("Modalis USD", "mUSD", 6);
        mBTC = new MockERC20("Modalis BTC", "mBTC", 8);
        mETH = new MockERC20("Modalis ETH", "mETH", 18);
        mBOND = new MockERC20("Modalis BOND", "mBOND", 18);

        registry.addAsset(address(mBTC), address(oracle), 5000, false, "mBTC");
        registry.addAsset(address(mETH), address(oracle), 5000, false, "mETH");
        registry.addAsset(address(mBOND), address(oracle), 5000, false, "mBOND");
        registry.addAsset(address(mUSD), address(oracle), 10_000, true, "mUSD");

        oracle.setPrice(address(mUSD), 1e18);
        oracle.setPrice(address(mBTC), 50_000e18);
        oracle.setPrice(address(mETH), 2_500e18);
        oracle.setPrice(address(mBOND), 100e18);

        adapter = new MockExecutionAdapter(registry, 10); // 10 bps spread
        registry.setAdapterApproved(address(adapter), true);
        // Venue inventory
        mUSD.mint(address(adapter), 1_000_000e6);
        mBTC.mint(address(adapter), 100e8);
        mETH.mint(address(adapter), 1_000e18);
        mBOND.mint(address(adapter), 10_000e18);

        // User: mandate + manager + $10,000 deposit (35/30/25/10)
        vm.startPrank(user);
        mandate.setMandate(_params(), _allocs());
        mandate.setManager(manager);
        _fund(user, mBTC, 7_000_000); // 0.07 BTC  = $3,500
        _fund(user, mETH, 1.2e18); // 1.2 ETH   = $3,000
        _fund(user, mBOND, 25e18); // 25 BOND   = $2,500
        _fund(user, mUSD, 1_000e6); // $1,000
        vm.stopPrank();
    }

    // ---------------------------------------------------------------- helpers

    function _params() internal view returns (PortfolioMandate.MandateParams memory) {
        return PortfolioMandate.MandateParams({
            targetValue: 20_000e18,
            targetDate: uint64(block.timestamp + 5 * 365 days),
            maxDrawdownBps: 1500,
            minLiquidityBps: 1000,
            rebalanceThresholdBps: 500,
            maxSingleAssetBps: 4000,
            maxSlippageBps: 200
        });
    }

    function _allocs() internal view returns (PortfolioMandate.Allocation[] memory a) {
        a = new PortfolioMandate.Allocation[](4);
        a[0] = PortfolioMandate.Allocation(address(mBTC), 3500, 3000, 4000);
        a[1] = PortfolioMandate.Allocation(address(mETH), 3000, 2500, 3500);
        a[2] = PortfolioMandate.Allocation(address(mBOND), 2500, 2000, 3000);
        a[3] = PortfolioMandate.Allocation(address(mUSD), 1000, 1000, 2000);
    }

    function _fund(address who, MockERC20 t, uint256 amt) internal {
        t.mint(who, amt);
        t.approve(address(vault), amt);
        vault.deposit(address(t), amt);
    }

    function _proposal(address tIn, address tOut, uint256 amtIn, uint256 minOutPct)
        internal
        view
        returns (RebalanceExecutor.Proposal memory p)
    {
        uint256 expected = registry.convert(tIn, tOut, amtIn);
        p = RebalanceExecutor.Proposal({
            owner: user,
            adapter: address(adapter),
            tokenIn: tIn,
            tokenOut: tOut,
            amountIn: amtIn,
            minAmountOut: (expected * minOutPct) / 100,
            deadline: block.timestamp + 10 minutes,
            mandateVersion: 1,
            nonce: executor.nextNonce(user),
            reasonHash: keccak256("test")
        });
    }

    /// BTC rallies to $70k: BTC ~43% of portfolio (> 40% cap), liquidity ~8.8% (< 10% floor).
    function _rally() internal {
        oracle.setPrice(address(mBTC), 70_000e18);
    }

    // ------------------------------------------------------------------ mandate

    function test_mandateStoredAndVersioned() public view {
        PortfolioMandate.Mandate memory m = mandate.mandateOf(user);
        assertEq(m.version, 1);
        assertTrue(m.active);
        assertEq(m.maxSingleAssetBps, 4000);
        assertEq(mandate.allocationsOf(user).length, 4);
        assertEq(mandate.managerOf(user), manager);
    }

    function test_mandateRejectsTargetsNot100() public {
        PortfolioMandate.Allocation[] memory a = _allocs();
        a[3].targetBps = 500; // sum = 9500
        a[3].minBps = 500;
        PortfolioMandate.MandateParams memory p = _params();
        p.minLiquidityBps = 500;
        vm.prank(stranger);
        vm.expectPartialRevert(PortfolioMandate.TARGETS_NOT_100_PERCENT.selector);
        mandate.setMandate(p, a);
    }

    function test_mandateRejectsTargetAboveSingleAssetCap() public {
        PortfolioMandate.Allocation[] memory a = _allocs();
        a[0].targetBps = 4500;
        a[0].maxBps = 5000;
        a[2].targetBps = 2000; // keep sum at 10_000
        a[2].minBps = 1500;
        vm.prank(stranger);
        vm.expectPartialRevert(PortfolioMandate.MAX_ALLOCATION_EXCEEDED.selector);
        mandate.setMandate(_params(), a);
    }

    function test_mandateRejectsDisabledAsset() public {
        registry.setAssetEnabled(address(mBOND), false);
        vm.prank(stranger);
        vm.expectPartialRevert(PortfolioMandate.ASSET_NOT_ENABLED.selector);
        mandate.setMandate(_params(), _allocs());
    }

    function test_mandateRejectsLowLiquidityTarget() public {
        PortfolioMandate.MandateParams memory p = _params();
        p.minLiquidityBps = 1500; // target liquid = 1000 < 1500
        vm.prank(stranger);
        vm.expectPartialRevert(PortfolioMandate.LIQUIDITY_TARGET_TOO_LOW.selector);
        mandate.setMandate(p, _allocs());
    }

    function test_managerCannotModifyUsersMandate() public {
        // Mandates are keyed by msg.sender: a manager "setting" a mandate only creates their own.
        PortfolioMandate.MandateParams memory p = _params();
        p.maxSingleAssetBps = 5000;
        vm.prank(manager);
        mandate.setMandate(p, _allocs());
        assertEq(mandate.mandateOf(user).maxSingleAssetBps, 4000);
        assertEq(mandate.mandateOf(user).version, 1);
    }

    // ------------------------------------------------------------ vault / funds

    function test_depositAccounting() public view {
        assertEq(vault.balanceOf(user, address(mBTC)), 7_000_000);
        assertEq(mUSD.balanceOf(address(vault)), 1_000e6);
    }

    function test_depositRejectsAssetOutsideMandate() public {
        MockERC20 junk = new MockERC20("Junk", "JNK", 18);
        junk.mint(user, 1e18);
        vm.startPrank(user);
        junk.approve(address(vault), 1e18);
        vm.expectRevert(abi.encodeWithSelector(PortfolioVault.ASSET_NOT_ENABLED.selector, address(junk)));
        vault.deposit(address(junk), 1e18);
        vm.stopPrank();
    }

    function test_ownerWithdraws() public {
        vm.prank(user);
        vault.withdraw(address(mUSD), 400e6);
        assertEq(mUSD.balanceOf(user), 400e6);
        assertEq(vault.balanceOf(user, address(mUSD)), 600e6);
    }

    function test_managerCannotWithdrawUserFunds() public {
        vm.prank(manager);
        vm.expectPartialRevert(PortfolioVault.INSUFFICIENT_BALANCE.selector);
        vault.withdraw(address(mUSD), 1e6);
    }

    function test_onlyExecutorCanTradeFromVault() public {
        vm.prank(manager);
        vm.expectRevert(PortfolioVault.NOT_EXECUTOR.selector);
        vault.executeTrade(user, address(adapter), address(mBTC), 1, address(mUSD), 0, "");
    }

    // ------------------------------------------------- rebalance: valid path

    function test_validRebalanceAfterBreach() public {
        _rally();

        // Sell ~$1,000 of BTC into mUSD: fixes the 40% cap AND the 10% liquidity floor.
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);

        vm.prank(manager);
        uint256 out = executor.execute(p, "");

        assertGt(out, 998e6);
        assertEq(vault.balanceOf(user, address(mBTC)), 7_000_000 - 1_428_571);
        assertEq(vault.balanceOf(user, address(mUSD)), 1_000e6 + out);
        assertEq(executor.nextNonce(user), 1);
    }

    function test_ownerCanAlsoSubmitProposal() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);
        vm.prank(user);
        executor.execute(p, "");
    }

    // ------------------------------- THE demo moment: AI is not the security boundary

    function test_invalidProposalRevertsMaxAllocationExceeded() public {
        // "AI" tries to push BTC to 55% by swapping $2,000 of BOND into BTC. Cap is 40%.
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mBTC), 20e18, 99);

        vm.prank(manager);
        // ~55% (spread makes it 5499 bps, not exactly 5500) vs 40% cap -> REVERT: MAX_ALLOCATION_EXCEEDED
        vm.expectPartialRevert(PortfolioMandate.MAX_ALLOCATION_EXCEEDED.selector);
        executor.execute(p, "");

        // Whole tx reverted: nonce unchanged, balances unchanged.
        assertEq(executor.nextNonce(user), 0);
        assertEq(vault.balanceOf(user, address(mBOND)), 25e18);
    }

    function test_tradeThatBreachesLiquidityFloorReverts() public {
        // Sell $500 of USD into BOND: liquidity falls to ~5% < 10% floor (and below the range min).
        RebalanceExecutor.Proposal memory p = _proposal(address(mUSD), address(mBOND), 500e6, 99);
        vm.prank(manager);
        vm.expectPartialRevert(PortfolioMandate.ALLOCATION_BELOW_MIN.selector);
        executor.execute(p, "");
    }

    // ------------------------------------------------------------ trade safety

    function test_slippageTooLooseReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 90); // -10%
        vm.prank(manager);
        vm.expectPartialRevert(RebalanceExecutor.SLIPPAGE_TOO_LOOSE.selector);
        executor.execute(p, "");
    }

    function test_unapprovedAdapterReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);
        p.adapter = address(0xBEEF);
        vm.prank(manager);
        vm.expectPartialRevert(PortfolioVault.ADAPTER_NOT_APPROVED.selector);
        executor.execute(p, "");
    }

    function test_staleMandateVersionReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);

        vm.prank(user);
        mandate.setMandate(_params(), _allocs()); // -> version 2

        vm.prank(manager);
        vm.expectPartialRevert(RebalanceExecutor.STALE_MANDATE_VERSION.selector);
        executor.execute(p, "");
    }

    function test_expiredProposalReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);
        vm.warp(block.timestamp + 11 minutes);
        oracle.setPrice(address(mBTC), 70_000e18); // keep the oracle fresh
        oracle.setPrice(address(mUSD), 1e18);
        oracle.setPrice(address(mETH), 2_500e18);
        oracle.setPrice(address(mBOND), 100e18);
        vm.prank(manager);
        vm.expectPartialRevert(RebalanceExecutor.PROPOSAL_EXPIRED.selector);
        executor.execute(p, "");
    }

    function test_replayReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);
        vm.startPrank(manager);
        executor.execute(p, "");
        vm.expectPartialRevert(RebalanceExecutor.INVALID_NONCE.selector);
        executor.execute(p, "");
        vm.stopPrank();
    }

    function test_unauthorizedCallerReverts() public {
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mUSD), 1e18, 99);
        vm.prank(stranger);
        vm.expectRevert(RebalanceExecutor.NOT_AUTHORIZED.selector);
        executor.execute(p, "");
    }

    function test_revokedManagerReverts() public {
        vm.prank(user);
        mandate.setManager(address(0));
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mUSD), 1e18, 99);
        vm.prank(manager);
        vm.expectRevert(RebalanceExecutor.NOT_AUTHORIZED.selector);
        executor.execute(p, "");
    }

    function test_inactiveMandateReverts() public {
        vm.prank(user);
        mandate.setActive(false);
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mUSD), 1e18, 99);
        vm.prank(manager);
        vm.expectRevert(RebalanceExecutor.MANDATE_INACTIVE.selector);
        executor.execute(p, "");
    }

    // ------------------------------------------------------------------ pause

    function test_pauseBlocksDepositsAndTradesButNotWithdrawals() public {
        vault.pause();

        vm.startPrank(user);
        mUSD.mint(user, 1e6);
        mUSD.approve(address(vault), 1e6);
        vm.expectRevert(); // EnforcedPause
        vault.deposit(address(mUSD), 1e6);
        vm.stopPrank();

        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_428_571, 99);
        vm.prank(manager);
        vm.expectRevert(); // vault paused -> trade blocked
        executor.execute(p, "");

        uint256 walletBefore = mUSD.balanceOf(user);
        vm.prank(user);
        vault.withdraw(address(mUSD), 100e6); // exit still works
        assertEq(mUSD.balanceOf(user), walletBefore + 100e6);
    }

    function test_executorPauseBlocksExecute() public {
        executor.pause();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mUSD), 1e18, 99);
        vm.prank(manager);
        vm.expectRevert(); // EnforcedPause
        executor.execute(p, "");
    }

    function test_emergencyWithdrawReturnsEverythingEvenWhenPaused() public {
        vault.pause();
        vm.prank(user);
        vault.emergencyWithdraw();

        assertEq(mBTC.balanceOf(user), 7_000_000);
        assertEq(mETH.balanceOf(user), 1.2e18);
        assertEq(mBOND.balanceOf(user), 25e18);
        assertEq(mUSD.balanceOf(user), 1_000e6);
        assertEq(vault.balanceOf(user, address(mBTC)), 0);
    }

    // -------------------------------------------------------- state / oracle

    function test_portfolioStateValuesAre35_30_25_10() public view {
        (, uint256[] memory values, uint256 total) = executor.portfolioState(user);
        assertEq(total, 10_000e18);
        assertEq(values[0], 3_500e18);
        assertEq(values[1], 3_000e18);
        assertEq(values[2], 2_500e18);
        assertEq(values[3], 1_000e18);
    }

    function test_stalePriceBlocksExecution() public {
        vm.warp(block.timestamp + 2 days); // oracle maxAge is 1 day
        RebalanceExecutor.Proposal memory p = RebalanceExecutor.Proposal({
            owner: user,
            adapter: address(adapter),
            tokenIn: address(mBOND),
            tokenOut: address(mUSD),
            amountIn: 1e18,
            minAmountOut: 0,
            deadline: block.timestamp + 10 minutes,
            mandateVersion: 1,
            nonce: 0,
            reasonHash: keccak256("stale")
        });
        vm.prank(manager);
        vm.expectPartialRevert(MockPriceOracle.PRICE_STALE.selector);
        executor.execute(p, "");
    }

    // ------------------------------------------------------------ CRE receiver

    function test_riskSignalOnlyFromForwarder() public {
        address fwd = address(0xF0);
        RiskSignalReceiver r = new RiskSignalReceiver(address(this), fwd);
        bytes memory report = abi.encode(user, uint8(2), uint32(1), uint256(750), uint256(11_400e18), keccak256("MAX"));

        vm.prank(stranger);
        vm.expectRevert(RiskSignalReceiver.NOT_FORWARDER.selector);
        r.onReport("", report);

        vm.prank(fwd);
        r.onReport("", report);
        (RiskSignalReceiver.RiskStatus status, uint32 ver,, uint256 drift,,) = r.latest(user);
        assertEq(uint8(status), 2);
        assertEq(ver, 1);
        assertEq(drift, 750);
    }

    // ---------------------------------------------------------------- fuzzing

    /// Invariant-style: whatever amount is traded, a successful execute always leaves the
    /// portfolio inside the mandate (validate must not revert on the final state).
    function testFuzz_successfulTradeAlwaysLeavesMandateCompliant(uint256 amt) public {
        amt = bound(amt, 1, 20e18);
        RebalanceExecutor.Proposal memory p = _proposal(address(mBOND), address(mUSD), amt, 99);
        vm.prank(manager);
        try executor.execute(p, "") {
            (, uint256[] memory values,) = executor.portfolioState(user);
            mandate.validate(user, values); // would revert if non-compliant
        } catch {
            // reverting is always acceptable; violating the mandate is not
        }
    }
}
