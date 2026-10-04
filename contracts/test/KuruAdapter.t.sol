// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PortfolioMandate} from "../src/PortfolioMandate.sol";
import {PortfolioVault} from "../src/PortfolioVault.sol";
import {RebalanceExecutor} from "../src/RebalanceExecutor.sol";
import {KuruAdapter} from "../src/adapters/KuruAdapter.sol";
import {IKuruRouter} from "../src/interfaces/IKuruRouter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockKuruRouter} from "./mocks/MockKuruRouter.sol";

/// @notice Exercises the Kuru execution path end to end: RebalanceExecutor -> PortfolioVault ->
///         KuruAdapter -> Kuru router, including post-trade mandate validation.
contract KuruAdapterTest is Test {
    AssetRegistry registry;
    PortfolioMandate mandate;
    PortfolioVault vault;
    RebalanceExecutor executor;
    MockPriceOracle oracle;
    MockKuruRouter router;
    KuruAdapter adapter;

    MockERC20 mUSD;
    MockERC20 mBTC;
    MockERC20 mETH;
    MockERC20 mBOND;

    address user = makeAddr("user");
    address manager = makeAddr("manager");
    address stranger = makeAddr("stranger");

    // Kuru orderbook markets the adapter is allowed to route through.
    address marketBtcUsd = makeAddr("kuru:mBTC-mUSD");
    address marketEthUsd = makeAddr("kuru:mETH-mUSD");
    address marketUnvetted = makeAddr("kuru:unvetted");

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

        router = new MockKuruRouter(registry);
        adapter = new KuruAdapter(address(this), IKuruRouter(address(router)));
        address[] memory markets = new address[](2);
        markets[0] = marketBtcUsd;
        markets[1] = marketEthUsd;
        adapter.setMarketsAllowed(markets, true);

        registry.setAdapterApproved(address(adapter), true);

        // Venue inventory on the router.
        mUSD.mint(address(router), 1_000_000e6);
        mBTC.mint(address(router), 100e8);
        mETH.mint(address(router), 1_000e18);
        mBOND.mint(address(router), 10_000e18);

        vm.startPrank(user);
        mandate.setMandate(_params(), _allocs());
        mandate.setManager(manager);
        _fund(mBTC, 7_000_000); // 0.07 BTC = $3,500
        _fund(mETH, 1.2e18); // 1.2 ETH  = $3,000
        _fund(mBOND, 25e18); // 25 BOND  = $2,500
        _fund(mUSD, 1_000e6); // $1,000
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

    function _fund(MockERC20 t, uint256 amt) internal {
        t.mint(user, amt);
        t.approve(address(vault), amt);
        vault.deposit(address(t), amt);
    }

    // Encodes a single-leg route, exactly as encodeKuruRoute in packages/chain does off-chain.
    function _route(address market) internal pure returns (bytes memory) {
        address[] memory markets = new address[](1);
        bool[] memory isBuy = new bool[](1);
        bool[] memory nativeSend = new bool[](1);
        markets[0] = market;
        isBuy[0] = true;
        nativeSend[0] = false;
        return abi.encode(markets, isBuy, nativeSend);
    }

    function _routeNative(address market) internal pure returns (bytes memory) {
        address[] memory markets = new address[](1);
        bool[] memory isBuy = new bool[](1);
        bool[] memory nativeSend = new bool[](1);
        markets[0] = market;
        isBuy[0] = true;
        nativeSend[0] = true;
        return abi.encode(markets, isBuy, nativeSend);
    }

    function _mismatchedRoute(address market) internal pure returns (bytes memory) {
        address[] memory markets = new address[](2);
        bool[] memory isBuy = new bool[](1);
        bool[] memory nativeSend = new bool[](1);
        markets[0] = market;
        markets[1] = market;
        isBuy[0] = true;
        nativeSend[0] = false;
        return abi.encode(markets, isBuy, nativeSend);
    }

    function _proposal(address tIn, address tOut, uint256 amtIn)
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
            minAmountOut: (expected * 9800) / 10_000, // the mandate's 200 bps floor
            deadline: block.timestamp + 10 minutes,
            mandateVersion: 1,
            nonce: executor.nextNonce(user),
            reasonHash: keccak256("kuru test")
        });
    }

    /// BTC rallies to $70k: BTC ~43% (> 40% cap) and liquidity ~8.8% (< 10% floor).
    function _rally() internal {
        oracle.setPrice(address(mBTC), 70_000e18);
    }

    // ------------------------------------------------------------------ tests
    //
    // NOTE: proposals and routes are always built into locals BEFORE any prank/expectRevert
    // cheatcode. `_proposal` makes view calls of its own, which would otherwise consume the
    // cheatcode intended for `executor.execute`.

    function test_routesRealKuruCalldataAndCreditsVault() public {
        _rally();
        uint256 sellBtc = 1_000_000; // 0.01 BTC = $700
        uint256 usdBefore = vault.balanceOf(user, address(mUSD));
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), sellBtc);
        bytes memory route = _route(marketBtcUsd);

        vm.prank(manager);
        uint256 amountOut = executor.execute(p, route);

        assertGt(amountOut, 0, "no output");
        assertEq(vault.balanceOf(user, address(mUSD)), usdBefore + amountOut, "vault not credited");
        // The route survived abi.encode -> adapter -> router unchanged.
        assertEq(router.lastRouteLength(), 1);
        assertEq(router.lastMarkets(0), marketBtcUsd);
        assertTrue(router.lastIsBuy(0));
        assertFalse(router.lastNativeSend(0));
        // The adapter keeps nothing.
        assertEq(mUSD.balanceOf(address(adapter)), 0, "adapter retained output");
        assertEq(mBTC.balanceOf(address(adapter)), 0, "adapter retained input");
    }

    function test_postTradeMandateStillEnforcedOnKuruPath() public {
        _rally();
        // Selling far too much BTC drives it under its 30% minimum: the mandate must still bite
        // even though execution happened on a real venue adapter.
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 5_000_000);
        bytes memory route = _route(marketBtcUsd);

        vm.prank(manager);
        vm.expectPartialRevert(PortfolioMandate.ALLOCATION_BELOW_MIN.selector);
        executor.execute(p, route);
    }

    function test_unvettedMarketReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory route = _route(marketUnvetted);

        vm.prank(manager);
        vm.expectPartialRevert(KuruAdapter.MARKET_NOT_ALLOWED.selector);
        executor.execute(p, route);
    }

    function test_nativeSendLegReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory route = _routeNative(marketBtcUsd);

        vm.prank(manager);
        vm.expectPartialRevert(KuruAdapter.NATIVE_SEND_UNSUPPORTED.selector);
        executor.execute(p, route);
    }

    function test_routeLengthMismatchReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory route = _mismatchedRoute(marketBtcUsd);

        vm.prank(manager);
        vm.expectPartialRevert(KuruAdapter.ROUTE_LENGTH_MISMATCH.selector);
        executor.execute(p, route);
    }

    function test_emptyRouteReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory empty = abi.encode(new address[](0), new bool[](0), new bool[](0));

        vm.prank(manager);
        vm.expectPartialRevert(KuruAdapter.EMPTY_ROUTE.selector);
        executor.execute(p, empty);
    }

    /// A venue that underfills must not be able to settle a trade below the mandate's floor.
    function test_venueUnderfillReverts() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory route = _route(marketBtcUsd);
        router.setFillBps(9_000); // 10% worse than oracle, well past the 200 bps ceiling

        vm.prank(manager);
        vm.expectRevert();
        executor.execute(p, route);
    }

    /// A venue that only partially fills cannot satisfy the mandate's slippage floor, which is
    /// quoted off the FULL amountIn, so a short fill can never settle. Here the venue's own
    /// min-out check rejects it first; PortfolioVault.INSUFFICIENT_OUTPUT is the backstop for a
    /// venue that does not check (exercised by test_venueUnderfillReverts via the vault path).
    function test_partialFillCannotSettleAtMandateSlippage() public {
        _rally();
        RebalanceExecutor.Proposal memory p = _proposal(address(mBTC), address(mUSD), 1_000_000);
        bytes memory route = _route(marketBtcUsd);
        router.setSpendBps(8_000); // router pulls only 80% of the input

        vm.prank(manager);
        vm.expectRevert(bytes("KURU_SLIPPAGE"));
        executor.execute(p, route);

        // Nothing moved: the user's balances are untouched and the adapter holds nothing.
        assertEq(vault.balanceOf(user, address(mBTC)), 7_000_000, "BTC balance changed on a failed trade");
        assertEq(mBTC.balanceOf(address(adapter)), 0, "adapter holds funds after a failed trade");
    }

    /// Adapter-level unit test: on a partial fill the adapter must hand the unspent input back to
    /// its caller rather than strand it. Called directly, because the executor (correctly) refuses
    /// a partial fill at mandate slippage — see the test above.
    function test_partialFillRefundsUnspentInputToCaller() public {
        router.setSpendBps(8_000);
        uint256 amountIn = 1_000_000; // 0.01 BTC

        mBTC.mint(address(this), amountIn);
        mBTC.approve(address(adapter), amountIn);

        uint256 spent = (amountIn * 8_000) / 10_000;
        uint256 expectedOut = (registry.convert(address(mBTC), address(mUSD), spent) * 9_990) / 10_000;

        uint256 btcBefore = mBTC.balanceOf(address(this));
        uint256 amountOut = adapter.swap(
            address(mBTC), address(mUSD), amountIn, expectedOut, address(this), _route(marketBtcUsd)
        );

        assertEq(amountOut, expectedOut, "unexpected output");
        assertEq(mBTC.balanceOf(address(adapter)), 0, "unspent input stranded in adapter");
        // Caller gave up `amountIn` and got the unspent 20% straight back.
        assertEq(mBTC.balanceOf(address(this)), btcBefore - spent, "unspent input not refunded");
        assertEq(mUSD.balanceOf(address(this)), amountOut, "output not delivered to recipient");
    }

    function test_onlyOwnerCanAllowMarkets() public {
        vm.prank(stranger);
        vm.expectPartialRevert(Ownable.OwnableUnauthorizedAccount.selector);
        adapter.setMarketAllowed(marketUnvetted, true);

        address[] memory markets = new address[](1);
        markets[0] = marketUnvetted;
        vm.prank(stranger);
        vm.expectPartialRevert(Ownable.OwnableUnauthorizedAccount.selector);
        adapter.setMarketsAllowed(markets, true);
    }

    function test_routerIsImmutable() public view {
        // There is no setter: the external call target cannot be changed after deployment.
        assertEq(address(adapter.router()), address(router));
    }
}
