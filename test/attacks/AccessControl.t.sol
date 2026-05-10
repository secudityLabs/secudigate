// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {MockSanctionsList} from "../../src/mocks/MockSanctionsList.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {IAccessControl} from "@openzeppelin-contracts/access/IAccessControl.sol";

/// @notice Privilege boundary tests — adversarial.
///
/// The contract has two privilege concepts:
///   - owner (Ownable):       manages the admin set.
///   - ADMIN_ROLE:            manages platform-level config (fee receiver,
///                            fee bps, pause, price feeds, sanctions oracle).
///
/// Neither can edit a merchant's slot — those are gated on the merchant's
/// own msg.sender. These tests probe every edge of that wall:
///   - merchants try to mess with each other
///   - admins try to mess with merchants
///   - the standard AccessControl grantRole path is locked out
///   - renouncing ownership truly burns the role
///   - operator economics: admin CAN move the platform fee receiver to
///     their own address (documented design — not exploitable on existing
///     funds since the contract holds no custody)

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract AccessControlAttacks is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address attacker = makeAddr("attacker");
    address opsAdmin = makeAddr("opsAdmin");
    address merchantA = makeAddr("merchantA");
    address merchantB = makeAddr("merchantB");
    address treasuryA = makeAddr("treasuryA");
    address treasuryB = makeAddr("treasuryB");
    address payer = makeAddr("payer");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100);
        mock = new Mock6();
        feed = new MockAggregator(8, 1e8, "MK / USD");

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));

        vm.prank(merchantA);
        gate.registerMerchant(treasuryA, address(0), 0, 0);
        vm.prank(merchantB);
        gate.registerMerchant(treasuryB, address(0), 0, 0);
    }

    function test_merchant_cannotEditAnotherMerchantsTreasury() public {
        // merchantA tries to take over merchantB's slot by spoofing —
        // but the contract reads msg.sender, so this just edits A's own
        // slot. We assert: A's call doesn't alter B's slot at all.
        vm.prank(merchantA);
        gate.setMerchantTreasury(address(0xBEEF));

        (address t_b,,,,,) = gate.merchants(merchantB);
        assertEq(t_b, treasuryB, "merchantB's treasury intact");
        (address t_a,,,,,) = gate.merchants(merchantA);
        assertEq(t_a, address(0xBEEF), "merchantA edited their own slot");
    }

    function test_merchant_cannotPauseAnotherMerchant() public {
        vm.prank(merchantA);
        gate.setMerchantPaused(true);
        (,,,,, bool pa) = gate.merchants(merchantA);
        (,,,,, bool pb) = gate.merchants(merchantB);
        assertTrue(pa, "A is paused");
        assertFalse(pb, "B is not paused");
    }

    function test_attacker_cannotSetAnyMerchantConfig() public {
        // Attacker has no registered merchant. Every merchant-only call
        // reverts with CallerNotMerchant.
        vm.startPrank(attacker);
        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantTreasury(address(0xBEEF));

        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantFee(address(0xCAFE), 100);

        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantDailyLimit(1_000_000_000);

        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantPaused(true);
        vm.stopPrank();
    }

    function test_admin_cannotEditMerchantConfig() public {
        // ADMIN_ROLE holder (the deploy owner) tries every merchant fn.
        // All revert with CallerNotMerchant. The split keeps an
        // operator from rugging individual merchants.
        vm.startPrank(provider);
        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantTreasury(address(0xBEEF));

        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantFee(address(0xCAFE), 100);

        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantPaused(true);
        vm.stopPrank();
    }

    function test_owner_cannotBypassAddAdminViaGrantRole() public {
        // The standard AccessControl path is locked because
        // DEFAULT_ADMIN_ROLE was never granted to anyone.
        bytes32 ADMIN = gate.ADMIN_ROLE();
        bytes32 DEFAULT = gate.DEFAULT_ADMIN_ROLE();
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, provider, DEFAULT)
        );
        gate.grantRole(ADMIN, attacker);
    }

    function test_admin_cannotAddOtherAdmins() public {
        // Only owner can add admins. A holder of ADMIN_ROLE that isn't
        // the owner can't propagate the role.
        vm.prank(provider);
        gate.addAdmin(opsAdmin);

        vm.prank(opsAdmin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, opsAdmin));
        gate.addAdmin(attacker);
    }

    function test_admin_cannotRemoveOtherAdmins() public {
        // Same shape for removal — only owner.
        vm.prank(provider);
        gate.addAdmin(opsAdmin);

        vm.prank(opsAdmin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, opsAdmin));
        gate.removeAdmin(provider);
    }

    function test_renouncedOwner_cannotReclaim() public {
        vm.prank(provider);
        gate.renounceOwnership();

        // No one is owner now. Trying to take ownership reverts.
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, provider));
        gate.transferOwnership(provider);

        // Even the previous owner can't add admins anymore.
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, provider));
        gate.addAdmin(attacker);
    }

    function test_renounceOwnership_keepsOtherAdmins() public {
        vm.prank(provider);
        gate.addAdmin(opsAdmin);
        vm.prank(provider);
        gate.renounceOwnership();

        // opsAdmin still has admin powers (pause is the canonical test).
        vm.prank(opsAdmin);
        gate.pause();
        assertTrue(gate.paused());

        // But can't grant new admins because they aren't the owner.
        vm.prank(opsAdmin);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, opsAdmin));
        gate.addAdmin(attacker);
    }

    //
    // An admin can re-point the platform fee receiver to their own address
    // and divert future fees to themselves. This is by design — the admin
    // set is the project's trust anchor for platform-fee disposition.
    // Existing funds aren't drained (no custody). New payments after the
    // swap go to the new receiver.

    function test_admin_canRedirectPlatformFeeReceiver_documentedDesign() public {
        // Pay once → platformRecv gets the fee.
        mock.transfer(payer, 1_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
        vm.prank(payer);
        gate.pay(_id("before"), merchantA, address(mock), 100e6);
        assertEq(mock.balanceOf(platformRecv), 1e6, "platform fee before");

        // Admin swaps the receiver.
        vm.prank(provider);
        gate.setSecudigate(opsAdmin);

        // Subsequent payments go to the new receiver. Existing funds
        // (1e6 in platformRecv) are untouched.
        vm.prank(payer);
        gate.pay(_id("after"), merchantA, address(mock), 100e6);
        assertEq(mock.balanceOf(platformRecv), 1e6, "old recv unchanged");
        assertEq(mock.balanceOf(opsAdmin), 1e6, "new recv received fee");
    }

    function test_attacker_cannotRedirectPlatformFee() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, ADMIN)
        );
        gate.setSecudigate(attacker);
    }

    function test_attacker_cannotRaiseFeeBpsAboveCap() public {
        // Even an admin can't raise the platform fee past 2%.
        uint16 max = gate.MAX_PLATFORM_FEE_BPS();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PlatformFeeTooHigh.selector, max));
        gate.setSecudigateFeeBps(max + 1);
    }

    function test_attacker_cannotChangeSanctionsList() public {
        MockSanctionsList list = new MockSanctionsList();
        bytes32 ADMIN = gate.ADMIN_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, ADMIN)
        );
        gate.setSanctionsList(address(list));
    }

    function test_attacker_cannotDisableSanctionsList() public {
        MockSanctionsList list = new MockSanctionsList();
        vm.prank(provider);
        gate.setSanctionsList(address(list));

        bytes32 ADMIN = gate.ADMIN_ROLE();
        vm.prank(attacker);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, attacker, ADMIN)
        );
        gate.setSanctionsList(address(0));
    }

    function test_pause_blocksRegisterAndPay_unblocksOnUnpause() public {
        vm.prank(provider);
        gate.pause();

        // No new merchant registrations.
        vm.prank(makeAddr("newM"));
        vm.expectRevert();
        gate.registerMerchant(treasuryA, address(0), 0, 0);

        // No payments through existing merchants.
        mock.transfer(payer, 1_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("paused"), merchantA, address(mock), 1e6);

        // Unpause and the same path works.
        vm.prank(provider);
        gate.unpause();
        vm.prank(payer);
        gate.pay(_id("after-unpause"), merchantA, address(mock), 1e6);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
