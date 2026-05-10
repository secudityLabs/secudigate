// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Invoice replay + collision attack surface.
///
/// `paidInvoices[invoiceId]` is a single global map — invoice IDs collide
/// across merchants. This is intentional (the backend generates random
/// 32-byte IDs so collisions are statistically impossible) but the
/// behavior is worth pinning down.
///
/// `deposit` deliberately has NO replay protection — that's the point
/// of an open-amount deposit link. Anyone can pay against the same link
/// any number of times.
///
/// These tests probe:
///   - same invoiceId twice → second reverts (the canonical replay test)
///   - same invoiceId across merchants → globally consumed, second reverts
///   - failed pay() (e.g. cap-exceeded) does NOT consume the invoiceId,
///     because state changes revert atomically
///   - bytes32(0) is a valid (but only single-use) invoice ID
///   - attacker can "claim" an invoice ID by paying first, but the
///     funds still go to the merchant — only the slot is consumed
///   - deposit is replayable freely (no protection by design)
///   - invoice and deposit don't share replay space (deposits are
///     untracked, so a value that's been used as an invoiceId is still
///     a valid string ref for deposits)

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract ReplayAttacks is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchantA = makeAddr("merchantA");
    address merchantB = makeAddr("merchantB");
    address treasuryA = makeAddr("treasuryA");
    address treasuryB = makeAddr("treasuryB");
    address payer = makeAddr("payer");
    address attacker = makeAddr("attacker");

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

        mock.transfer(payer, 100_000e6);
        mock.transfer(attacker, 100_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
        vm.prank(attacker);
        mock.approve(address(gate), type(uint256).max);
    }

    function test_payTwice_secondReverts() public {
        bytes32 id = _id("once");
        vm.prank(payer);
        gate.pay(id, merchantA, address(mock), 100e6);

        vm.prank(payer);
        vm.expectRevert(Secudigate.InvoiceAlreadyPaid.selector);
        gate.pay(id, merchantA, address(mock), 100e6);
    }

    function test_sameInvoiceId_differentMerchant_secondReverts() public {
        // The backend issues 32-byte random IDs, so a collision across
        // tenants is a 1-in-2^256 event. But the contract enforces a
        // global ID space — verify that explicitly.
        bytes32 id = _id("shared");
        vm.prank(payer);
        gate.pay(id, merchantA, address(mock), 50e6);

        // Even though merchantB never saw this ID, paying for it now
        // reverts as if it's already paid.
        vm.prank(payer);
        vm.expectRevert(Secudigate.InvoiceAlreadyPaid.selector);
        gate.pay(id, merchantB, address(mock), 50e6);
    }

    function test_failedPay_doesNotBurnInvoiceId() public {
        // Use a cap-enabled merchant so we can force a failure deep in
        // _route AFTER the invoiceId would have been marked paid.
        address capped = makeAddr("capped");
        vm.prank(capped);
        gate.registerMerchant(makeAddr("capTreasury"), address(0), 0, 100_000_000); // $100 cap

        bytes32 id = _id("fail-then-retry");

        // First attempt: amount > cap → DailyLimitExceeded.
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(id, capped, address(mock), 1_000e6); // $1000 > $100 cap

        // The invoiceId should NOT be marked paid — because the whole tx
        // (including the `paidInvoices[invoiceId] = true` assignment)
        // reverted atomically.
        assertFalse(gate.paidInvoices(id), "id not consumed by failed pay");

        // Retry with a valid amount.
        vm.prank(payer);
        gate.pay(id, capped, address(mock), 50e6);
        assertTrue(gate.paidInvoices(id), "id consumed after successful retry");
    }

    function test_bytes32Zero_isValidButSingleUse() public {
        bytes32 zero = bytes32(0);
        assertFalse(gate.paidInvoices(zero));

        vm.prank(payer);
        gate.pay(zero, merchantA, address(mock), 10e6);
        assertTrue(gate.paidInvoices(zero));

        vm.prank(payer);
        vm.expectRevert(Secudigate.InvoiceAlreadyPaid.selector);
        gate.pay(zero, merchantA, address(mock), 10e6);
    }

    function test_attackerPaysInvoice_fundsStillGoToMerchant() public {
        // anyone-can-pay is by design: the gateway doesn't authenticate
        // the payer against the invoice. An attacker paying $1 to "burn"
        // an outstanding invoice ID gets nothing material — the funds
        // still go to the merchant. The only harm is consuming the ID
        // slot, which the merchant can recover from by issuing a new ID.
        bytes32 id = _id("griefed");
        uint256 attackerBefore = mock.balanceOf(attacker);
        uint256 treasuryBefore = mock.balanceOf(treasuryA);

        vm.prank(attacker);
        gate.pay(id, merchantA, address(mock), 1e6);

        // Attacker spent the tokens (no refund). Merchant got them.
        assertEq(attackerBefore - mock.balanceOf(attacker), 1e6, "attacker paid");
        assertEq(mock.balanceOf(treasuryA) - treasuryBefore, 0.99e6, "merchant received");
        // The legitimate payer must now use a new invoice ID.
        assertTrue(gate.paidInvoices(id));
    }

    function test_depositRef_isReusable() public {
        // No replay protection on deposit — same paymentRef can be hit
        // any number of times.
        for (uint256 i; i < 5; i++) {
            vm.prank(payer);
            gate.deposit(merchantA, "ACCOUNT-9999", address(mock), 10e6);
        }
        // Each deposit forwards independently.
        assertEq(mock.balanceOf(treasuryA), 5 * 9.9e6, "five deposits routed");
        assertEq(gate.merchantDepositCount(merchantA), 5, "five deposit count");
    }

    function test_depositRef_isIndependentOfInvoiceIdSpace() public {
        // Use a value as an invoice ID, then use the same byte sequence
        // (as a string) as a deposit ref. They're in different spaces.
        bytes32 id = keccak256("ABC123");
        vm.prank(payer);
        gate.pay(id, merchantA, address(mock), 10e6);

        // Deposit ref is just a free-form string — no overlap with
        // paidInvoices. Should succeed.
        vm.prank(payer);
        gate.deposit(merchantA, "ABC123", address(mock), 5e6);
    }

    function test_replayCheck_runsAfterPausedCheck() public {
        // While paused, even an already-used invoice ID gets the paused
        // revert path — pausable runs first. This is a minor ordering
        // detail but pinning it down helps with future audits.
        bytes32 id = _id("paused-replay");
        vm.prank(payer);
        gate.pay(id, merchantA, address(mock), 1e6);

        vm.prank(provider);
        gate.pause();

        vm.prank(payer);
        vm.expectRevert(); // EnforcedPause, not InvoiceAlreadyPaid
        gate.pay(id, merchantA, address(mock), 1e6);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
