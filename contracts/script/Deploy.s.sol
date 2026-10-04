// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PortfolioMandate} from "../src/PortfolioMandate.sol";
import {PortfolioVault} from "../src/PortfolioVault.sol";
import {RebalanceExecutor} from "../src/RebalanceExecutor.sol";
import {RiskSignalReceiver} from "../src/RiskSignalReceiver.sol";
import {KuruAdapter} from "../src/adapters/KuruAdapter.sol";
import {IKuruRouter} from "../src/interfaces/IKuruRouter.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockExecutionAdapter} from "../src/mocks/MockExecutionAdapter.sol";

/// @notice Deploys the Modalis protocol, plus the demo assets/oracle/adapter needed to run the
///         full loop on a testnet or a local node.
///
///   forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
///
/// Required env:
///   DEPLOYER_PRIVATE_KEY   deploys everything; owns registry / vault / executor
///
/// Optional env:
///   MANAGER_ADDRESS        authorised to submit rebalance proposals (users still opt in per
///                          portfolio via PortfolioMandate.setManager; this is only logged)
///   CRE_FORWARDER_ADDRESS  Chainlink CRE forwarder for this network. When unset, the
///                          RiskSignalReceiver is skipped rather than wired to a placeholder.
///   KURU_ROUTER_ADDRESS    Kuru router. When set, a KuruAdapter is deployed and approved, and
///                          Kuru becomes the execution venue. When unset, only the demo adapter
///                          is deployed.
///   KURU_MARKET_ADDRESSES  comma-separated Kuru market contracts to allowlist on the adapter.
///   DEPLOY_DEMO_ASSETS     "false" to skip the demo tokens/oracle/adapter (use for mainnet with
///                          real assets registered separately).
///
/// Writes `deployments/<chainId>.json`, which packages/chain reads.
///
/// MAINNET: do not use the demo tokens/oracle/adapter. Register real assets and a real oracle,
/// deploy the Kuru adapter, and transfer ownership to a multisig via Ownable2Step.
contract Deploy is Script {
    struct Deployed {
        address assetRegistry;
        address portfolioMandate;
        address portfolioVault;
        address rebalanceExecutor;
        address riskSignalReceiver;
        address priceOracle;
        address executionAdapter;
        address kuruAdapter;
        address mUSD;
        address mBTC;
        address mETH;
        address mBOND;
    }

    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address forwarder = vm.envOr("CRE_FORWARDER_ADDRESS", address(0));
        address kuruRouter = vm.envOr("KURU_ROUTER_ADDRESS", address(0));
        bool demoAssets = vm.envOr("DEPLOY_DEMO_ASSETS", true);

        Deployed memory d;

        vm.startBroadcast(pk);

        // --- Core protocol
        AssetRegistry registry = new AssetRegistry(deployer);
        PortfolioMandate mandate = new PortfolioMandate(registry);
        PortfolioVault vault = new PortfolioVault(deployer, registry, mandate);
        RebalanceExecutor executor = new RebalanceExecutor(deployer, registry, mandate, vault);
        vault.setExecutor(address(executor));

        d.assetRegistry = address(registry);
        d.portfolioMandate = address(mandate);
        d.portfolioVault = address(vault);
        d.rebalanceExecutor = address(executor);

        // --- Chainlink CRE risk signal sink. Only deployed with a real forwarder: a receiver
        //     pinned to address(0) would accept nothing and imply an integration that is absent.
        if (forwarder != address(0)) {
            d.riskSignalReceiver = address(new RiskSignalReceiver(deployer, forwarder));
        }

        // --- Demo assets + oracle + demo adapter
        if (demoAssets) {
            MockPriceOracle oracle = new MockPriceOracle(deployer, 1 days);
            d.priceOracle = address(oracle);

            MockERC20 mUSD = new MockERC20("Modalis USD (demo)", "mUSD", 6);
            MockERC20 mBTC = new MockERC20("Modalis BTC (demo)", "mBTC", 8);
            MockERC20 mETH = new MockERC20("Modalis ETH (demo)", "mETH", 18);
            MockERC20 mBOND = new MockERC20("Modalis BOND (demo)", "mBOND", 18);

            d.mUSD = address(mUSD);
            d.mBTC = address(mBTC);
            d.mETH = address(mETH);
            d.mBOND = address(mBOND);

            registry.addAsset(address(mBTC), address(oracle), 5000, false, "mBTC");
            registry.addAsset(address(mETH), address(oracle), 5000, false, "mETH");
            registry.addAsset(address(mBOND), address(oracle), 5000, false, "mBOND");
            registry.addAsset(address(mUSD), address(oracle), 10_000, true, "mUSD");

            oracle.setPrice(address(mUSD), 1e18);
            oracle.setPrice(address(mBTC), 50_000e18);
            oracle.setPrice(address(mETH), 2_500e18);
            oracle.setPrice(address(mBOND), 100e18);

            MockExecutionAdapter adapter = new MockExecutionAdapter(registry, 10);
            registry.setAdapterApproved(address(adapter), true);
            d.executionAdapter = address(adapter);

            // Venue inventory so the demo adapter can actually fill.
            mUSD.mint(address(adapter), 10_000_000e6);
            mBTC.mint(address(adapter), 1_000e8);
            mETH.mint(address(adapter), 10_000e18);
            mBOND.mint(address(adapter), 100_000e18);
        }

        // --- Kuru execution venue
        if (kuruRouter != address(0)) {
            KuruAdapter kuru = new KuruAdapter(deployer, IKuruRouter(kuruRouter));
            address[] memory markets = _kuruMarkets();
            if (markets.length > 0) kuru.setMarketsAllowed(markets, true);
            registry.setAdapterApproved(address(kuru), true);
            d.kuruAdapter = address(kuru);
        }

        vm.stopBroadcast();

        _report(d, deployer, forwarder, kuruRouter);
        _write(d);
    }

    /// @dev Parses KURU_MARKET_ADDRESSES ("0xabc,0xdef"). Empty when unset.
    function _kuruMarkets() internal view returns (address[] memory) {
        string memory raw = vm.envOr("KURU_MARKET_ADDRESSES", string(""));
        if (bytes(raw).length == 0) return new address[](0);
        string[] memory parts = vm.split(raw, ",");
        address[] memory out = new address[](parts.length);
        for (uint256 i = 0; i < parts.length; i++) {
            out[i] = vm.parseAddress(parts[i]);
        }
        return out;
    }

    function _report(Deployed memory d, address deployer, address forwarder, address kuruRouter) internal view {
        console2.log("=== MODALIS deployment ===");
        console2.log("chainId          ", block.chainid);
        console2.log("deployer         ", deployer);
        console2.log("AssetRegistry    ", d.assetRegistry);
        console2.log("PortfolioMandate ", d.portfolioMandate);
        console2.log("PortfolioVault   ", d.portfolioVault);
        console2.log("RebalanceExecutor", d.rebalanceExecutor);

        if (d.riskSignalReceiver != address(0)) {
            console2.log("RiskSignalReceiver", d.riskSignalReceiver);
            console2.log("  CRE forwarder   ", forwarder);
        } else {
            console2.log("RiskSignalReceiver SKIPPED (set CRE_FORWARDER_ADDRESS to deploy it)");
        }

        if (d.kuruAdapter != address(0)) {
            console2.log("KuruAdapter      ", d.kuruAdapter);
            console2.log("  Kuru router    ", kuruRouter);
        } else {
            console2.log("KuruAdapter SKIPPED (set KURU_ROUTER_ADDRESS to deploy it)");
        }

        if (d.executionAdapter != address(0)) {
            console2.log("MockExecutionAdapter (DEMO, not a venue)", d.executionAdapter);
            console2.log("MockPriceOracle      (DEMO)             ", d.priceOracle);
            console2.log("mUSD (demo)      ", d.mUSD);
            console2.log("mBTC (demo)      ", d.mBTC);
            console2.log("mETH (demo)      ", d.mETH);
            console2.log("mBOND (demo)     ", d.mBOND);
        }
    }

    /// @dev Writes deployments/<chainId>.json. packages/chain reads this, so the app never has
    ///      hand-copied addresses.
    function _write(Deployed memory d) internal {
        string memory o = "deployment";
        vm.serializeUint(o, "chainId", block.chainid);
        vm.serializeUint(o, "blockNumber", block.number);

        string memory c = "contracts";
        vm.serializeAddress(c, "assetRegistry", d.assetRegistry);
        vm.serializeAddress(c, "portfolioMandate", d.portfolioMandate);
        vm.serializeAddress(c, "portfolioVault", d.portfolioVault);
        vm.serializeAddress(c, "rebalanceExecutor", d.rebalanceExecutor);
        vm.serializeAddress(c, "riskSignalReceiver", d.riskSignalReceiver);
        vm.serializeAddress(c, "priceOracle", d.priceOracle);
        vm.serializeAddress(c, "executionAdapter", d.executionAdapter);
        string memory contractsJson = vm.serializeAddress(c, "kuruAdapter", d.kuruAdapter);

        string memory t = "tokens";
        vm.serializeAddress(t, "mUSD", d.mUSD);
        vm.serializeAddress(t, "mBTC", d.mBTC);
        vm.serializeAddress(t, "mETH", d.mETH);
        string memory tokensJson = vm.serializeAddress(t, "mBOND", d.mBOND);

        vm.serializeString(o, "contracts", contractsJson);
        string memory out = vm.serializeString(o, "tokens", tokensJson);

        string memory path = string.concat("deployments/", vm.toString(block.chainid), ".json");
        vm.writeJson(out, path);
        console2.log("wrote", path);
    }
}
