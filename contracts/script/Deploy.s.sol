// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {AssetRegistry} from "../src/AssetRegistry.sol";
import {PortfolioMandate} from "../src/PortfolioMandate.sol";
import {PortfolioVault} from "../src/PortfolioVault.sol";
import {RebalanceExecutor} from "../src/RebalanceExecutor.sol";
import {RiskSignalReceiver} from "../src/RiskSignalReceiver.sol";
import {MockERC20} from "../src/mocks/MockERC20.sol";
import {MockPriceOracle} from "../src/mocks/MockPriceOracle.sol";
import {MockExecutionAdapter} from "../src/mocks/MockExecutionAdapter.sol";

/// @notice Deploys the full Modalis protocol plus DEMO assets/oracle/adapter.
///
///   forge script script/Deploy.s.sol:Deploy --rpc-url monad_testnet --broadcast
///
/// Env: DEPLOYER_PRIVATE_KEY, CRE_FORWARDER_ADDRESS (CRE forwarder for the target Monad network)
/// Mainnet: do NOT use the mock tokens/oracle/adapter. Register real assets, a real oracle and the
/// Kuru adapter via AssetRegistry instead, and transfer ownership to a multisig (Ownable2Step).
contract Deploy is Script {
    function run() external {
        uint256 pk = vm.envUint("DEPLOYER_PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address forwarder = vm.envAddress("CRE_FORWARDER_ADDRESS");

        vm.startBroadcast(pk);

        // --- Core protocol
        MockPriceOracle oracle = new MockPriceOracle(deployer, 1 days);
        AssetRegistry registry = new AssetRegistry(deployer);
        PortfolioMandate mandate = new PortfolioMandate(registry);
        PortfolioVault vault = new PortfolioVault(deployer, registry, mandate);
        RebalanceExecutor executor = new RebalanceExecutor(deployer, registry, mandate, vault);
        vault.setExecutor(address(executor));
        RiskSignalReceiver receiver = new RiskSignalReceiver(deployer, forwarder);

        // --- DEMO assets (clearly labelled; not real investment assets)
        MockERC20 mUSD = new MockERC20("Modalis USD (demo)", "mUSD", 6);
        MockERC20 mBTC = new MockERC20("Modalis BTC (demo)", "mBTC", 8);
        MockERC20 mETH = new MockERC20("Modalis ETH (demo)", "mETH", 18);
        MockERC20 mBOND = new MockERC20("Modalis BOND (demo)", "mBOND", 18);

        registry.addAsset(address(mBTC), address(oracle), 5000, false, "mBTC");
        registry.addAsset(address(mETH), address(oracle), 5000, false, "mETH");
        registry.addAsset(address(mBOND), address(oracle), 5000, false, "mBOND");
        registry.addAsset(address(mUSD), address(oracle), 10_000, true, "mUSD");

        oracle.setPrice(address(mUSD), 1e18);
        oracle.setPrice(address(mBTC), 50_000e18);
        oracle.setPrice(address(mETH), 2_500e18);
        oracle.setPrice(address(mBOND), 100e18);

        // --- DEMO execution venue (swap for the Kuru adapter once its ABI is wired in)
        MockExecutionAdapter adapter = new MockExecutionAdapter(registry, 10);
        registry.setAdapterApproved(address(adapter), true);
        mUSD.mint(address(adapter), 10_000_000e6);
        mBTC.mint(address(adapter), 1_000e8);
        mETH.mint(address(adapter), 10_000e18);
        mBOND.mint(address(adapter), 100_000e18);

        vm.stopBroadcast();

        console2.log("chainId", block.chainid);
        console2.log("AssetRegistry     ", address(registry));
        console2.log("PortfolioMandate  ", address(mandate));
        console2.log("PortfolioVault    ", address(vault));
        console2.log("RebalanceExecutor ", address(executor));
        console2.log("RiskSignalReceiver", address(receiver));
        console2.log("MockPriceOracle   ", address(oracle));
        console2.log("MockExecutionAdapter", address(adapter));
        console2.log("mUSD ", address(mUSD));
        console2.log("mBTC ", address(mBTC));
        console2.log("mETH ", address(mETH));
        console2.log("mBOND", address(mBOND));
    }
}
