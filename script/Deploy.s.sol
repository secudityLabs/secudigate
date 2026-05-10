// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Script, console} from "forge-std/Script.sol";
import {Secudigate} from "../src/Secudigate.sol";
import {MockStablecoin} from "../src/mocks/MockStablecoin.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockSanctionsList} from "../src/mocks/MockSanctionsList.sol";

/// @notice Deploys three mock stablecoins (USDC/USDT/DAI) plus their mock
///         Chainlink USD aggregators (all pinned to $1.00) and the Secudigate
///         gateway, then wires the price feeds. Intended for testnets
///         (Sepolia) and local Anvil. Do not run against mainnet — the mocks
///         have an open faucet and a fake oracle.
///
///         For mainnet, deploy Secudigate alone, then call setTokenPriceFeed
///         from an admin account against the official Chainlink aggregators.
///
/// Usage:
///   forge script script/Deploy.s.sol:Deploy \
///     --rpc-url $SEPOLIA_RPC_URL \
///     --private-key $PRIVATE_KEY \
///     --broadcast \
///     --verify
///
/// Optional env vars:
///   PLATFORM_FEE_RECEIVER  Address that will receive the platform fee.
///                          Defaults to the deployer.
///   PLATFORM_FEE_BPS       Initial platform fee in basis points (default 100 = 1%).
///                          Capped at MAX_PLATFORM_FEE_BPS = 200.
///   FAUCET_COOLDOWN        Seconds between successive faucet drips per address.
///                          Defaults to 0 (no cooldown).
contract Deploy is Script {
    int256 internal constant ONE_USD_8DP = 1e8;

    function run() external {
        address deployer = msg.sender;

        address platformReceiver = vm.envOr("PLATFORM_FEE_RECEIVER", deployer);
        uint16 platformFeeBps = uint16(vm.envOr("PLATFORM_FEE_BPS", uint256(100)));
        uint256 faucetCooldown = vm.envOr("FAUCET_COOLDOWN", uint256(0));

        vm.startBroadcast();

        MockStablecoin usdc = new MockStablecoin("Mock USD Coin", "USDC", 6, 1_000 * 1e6, faucetCooldown, deployer);
        MockStablecoin usdt = new MockStablecoin("Mock Tether USD", "USDT", 6, 1_000 * 1e6, faucetCooldown, deployer);
        MockStablecoin dai =
            new MockStablecoin("Mock Dai Stablecoin", "DAI", 18, 1_000 * 1e18, faucetCooldown, deployer);

        // Mock Chainlink feeds — fixed at $1.00 with 8-decimal precision,
        // matching the real Chainlink USD aggregators on mainnet.
        MockAggregator usdcFeed = new MockAggregator(8, ONE_USD_8DP, "USDC / USD (mock)");
        MockAggregator usdtFeed = new MockAggregator(8, ONE_USD_8DP, "USDT / USD (mock)");
        MockAggregator daiFeed = new MockAggregator(8, ONE_USD_8DP, "DAI / USD (mock)");

        // Mock OFAC sanctions oracle. On mainnet, point Secudigate at the
        // real Chainalysis oracle (0x40C57923924B5c5c5455c48D93317139ADDaC8fb)
        // via setSanctionsList instead of deploying this mock.
        MockSanctionsList sanctions = new MockSanctionsList();

        Secudigate gateway = new Secudigate(deployer, platformReceiver, platformFeeBps);

        gateway.setTokenPriceFeed(address(usdc), address(usdcFeed));
        gateway.setTokenPriceFeed(address(usdt), address(usdtFeed));
        gateway.setTokenPriceFeed(address(dai), address(daiFeed));
        gateway.setSanctionsList(address(sanctions));

        vm.stopBroadcast();

        console.log("");
        console.log("==== Deployed ============================================");
        console.log("Deployer        :", deployer);
        console.log("Platform fee bps:", platformFeeBps);
        console.log("Platform receiver:", platformReceiver);
        console.log("---------------------------------------------------------");
        console.log("USDC      :", address(usdc));
        console.log("USDT      :", address(usdt));
        console.log("DAI       :", address(dai));
        console.log("USDC feed :", address(usdcFeed));
        console.log("USDT feed :", address(usdtFeed));
        console.log("DAI  feed :", address(daiFeed));
        console.log("Sanctions :", address(sanctions));
        console.log("Secudigate:", address(gateway));
        console.log("==========================================================");
        console.log("");
        console.log("Frontend env vars to set:");
        console.log("  VITE_PAYMENT_GATEWAY_ADDRESS=%s", address(gateway));
        console.log("  VITE_USDC_ADDRESS=%s", address(usdc));
        console.log("  VITE_USDT_ADDRESS=%s", address(usdt));
        console.log("  VITE_DAI_ADDRESS=%s", address(dai));
    }
}
