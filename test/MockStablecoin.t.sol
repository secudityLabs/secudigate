// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MockStablecoin} from "../src/mocks/MockStablecoin.sol";
import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";

contract MockStablecoinTest is Test {
    MockStablecoin usdc;
    address owner = makeAddr("owner");
    address user = makeAddr("user");

    function setUp() public {
        // 6 decimals, 1_000 USDC drip, 0 cooldown.
        usdc = new MockStablecoin("Mock USDC", "USDC", 6, 1_000e6, 0, owner);
    }

    function test_decimals_isCustom() public view {
        assertEq(usdc.decimals(), 6);
    }

    function test_faucet_dripsToCaller() public {
        vm.prank(user);
        usdc.faucet();
        assertEq(usdc.balanceOf(user), 1_000e6);
    }

    function test_faucet_isOpenToAnyone() public {
        address rando = makeAddr("rando");
        vm.prank(rando);
        usdc.faucet();
        assertEq(usdc.balanceOf(rando), 1_000e6);
    }

    function test_faucet_noCooldown_byDefault() public {
        vm.startPrank(user);
        usdc.faucet();
        usdc.faucet();
        usdc.faucet();
        vm.stopPrank();
        assertEq(usdc.balanceOf(user), 3 * 1_000e6);
    }

    function test_faucet_cooldown_blocksRapidClaims() public {
        // Re-deploy with 1h cooldown.
        MockStablecoin gated = new MockStablecoin("Mock", "MCK", 6, 1_000e6, 1 hours, owner);

        vm.prank(user);
        gated.faucet();

        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(MockStablecoin.FaucetCooldown.selector, block.timestamp + 1 hours));
        gated.faucet();

        // After cooldown, claim succeeds.
        vm.warp(block.timestamp + 1 hours + 1);
        vm.prank(user);
        gated.faucet();
        assertEq(gated.balanceOf(user), 2 * 1_000e6);
    }

    function test_mint_byOwner() public {
        vm.prank(owner);
        usdc.mint(user, 5_000e6);
        assertEq(usdc.balanceOf(user), 5_000e6);
    }

    function test_mint_revertsForNonOwner() public {
        vm.prank(user);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, user));
        usdc.mint(user, 1);
    }
}
