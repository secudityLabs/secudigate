// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Recipient gas-griefing attacks.
///
/// `_route` makes three direct `transferFrom(payer → recipient)` calls.
/// A recipient that is a contract can:
///   - revert in fallback / receive (impossible — these are token
///     transfers, not ETH transfers, so the recipient doesn't get a
///     callback unless it's the token itself)
///   - be a hostile ERC20 (covered in MaliciousToken.t.sol)
///   - have NO bytecode at all (an EOA) — the canonical case
///
/// In practice the only way a "recipient" can affect routing is via the
/// token's transferFrom logic — already covered. But there are still
/// useful properties to pin down:
///
///   - All three recipients can be the same address (treasury == feeReceiver
///     == platformRecv) — the payment routes through cleanly and
///     balances sum to the gross.
///   - Treasury / fee receiver / platform receiver can be contracts (any
///     contract, including the gateway itself for fun) — payment still
///     completes, because ERC20 transferFrom doesn't notify recipients.
///   - The contract itself as a recipient — verifies the invariant
///     "gateway never holds tokens" survives even if a merchant
///     misconfigures their treasury to point at the gateway. (Funds
///     ARE stuck in that case — documented.)
///   - Payer trying to grief by setting allowance to exactly the right
///     amount, then revoking mid-tx — can't, ERC20.approve is a separate
///     tx and there's no reentry vector for revocation here.

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// A contract recipient with no fallback/receive. ERC20 transfers to
/// this contract succeed (transferFrom just updates balances; no callback
/// to the recipient code).
contract DumbContract {
    // No fallback/receive — just sits there.
}

contract GasGriefingAttacks is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address payer = makeAddr("payer");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100); // 1%
        mock = new Mock6();
        feed = new MockAggregator(8, 1e8, "MK / USD");

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));

        mock.transfer(payer, 100_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
    }

    function test_allRecipientsSameAddress_routesAndSums() public {
        // Set platformRecv = the merchant fee receiver = the treasury =
        // a single address. All three transferFroms hit it in sequence.
        address solo = makeAddr("solo");
        vm.prank(provider);
        gate.setSecudigate(solo);

        vm.prank(merchant);
        gate.registerMerchant(solo, solo, 250, 0); // 2.5% merchant fee

        uint256 before_ = mock.balanceOf(solo);
        vm.prank(payer);
        gate.pay(_id("solo"), merchant, address(mock), 100e6);

        // Solo address gets all three slices: 1% + 2.5% + 96.5% = 100%.
        assertEq(mock.balanceOf(solo) - before_, 100e6, "solo received full gross");
    }

    function test_treasuryEqualsFeeReceiver_butNotPlatform() public {
        address solo = makeAddr("solo-mer");
        vm.prank(merchant);
        gate.registerMerchant(solo, solo, 250, 0);

        vm.prank(payer);
        gate.pay(_id("mer-solo"), merchant, address(mock), 100e6);

        // platformRecv gets 1%, solo gets 99%.
        assertEq(mock.balanceOf(platformRecv), 1e6);
        assertEq(mock.balanceOf(solo), 99e6);
    }

    function test_contractRecipient_treasury_succeeds() public {
        // Merchant's treasury is a plain contract. ERC20 transferFrom
        // doesn't notify recipient contracts, so this completes.
        DumbContract t = new DumbContract();
        vm.prank(merchant);
        gate.registerMerchant(address(t), address(0), 0, 0);

        vm.prank(payer);
        gate.pay(_id("c-treas"), merchant, address(mock), 100e6);
        assertEq(mock.balanceOf(address(t)), 99e6, "contract treasury funded");
    }

    function test_contractRecipient_feeReceiver_succeeds() public {
        DumbContract fr = new DumbContract();
        address treasury = makeAddr("treas");
        vm.prank(merchant);
        gate.registerMerchant(treasury, address(fr), 250, 0);

        vm.prank(payer);
        gate.pay(_id("c-fr"), merchant, address(mock), 100e6);
        assertEq(mock.balanceOf(address(fr)), 2.5e6, "contract fee receiver funded");
    }

    function test_contractRecipient_platformFee_succeeds() public {
        DumbContract pr = new DumbContract();
        vm.prank(provider);
        gate.setSecudigate(address(pr));

        address treasury = makeAddr("treas");
        vm.prank(merchant);
        gate.registerMerchant(treasury, address(0), 0, 0);

        vm.prank(payer);
        gate.pay(_id("c-pr"), merchant, address(mock), 100e6);
        assertEq(mock.balanceOf(address(pr)), 1e6, "contract platform receiver funded");
    }

    function test_gatewayAsTreasury_fundsAreStuck() public {
        // A merchant who points their treasury at the gateway contract
        // will see net funds accumulate ON the gateway with no way to
        // get them out (contract has no withdraw / rescue path — by
        // design, it's non-custodial). Documents the foot-gun.
        vm.prank(merchant);
        gate.registerMerchant(address(gate), address(0), 0, 0);

        vm.prank(payer);
        gate.pay(_id("self-treas"), merchant, address(mock), 100e6);

        // 99e6 net is stuck at the gateway.
        assertEq(mock.balanceOf(address(gate)), 99e6, "funds stuck (merchant mis-config)");
        // Platform fee made it to the right place.
        assertEq(mock.balanceOf(platformRecv), 1e6);
        // No rescue function exists — this is permanent. We don't try
        // to call one; the absence is the test.
    }

    function test_zeroPlatformFee_skipsTransferFrom() public {
        // Re-deploy with platform fee = 0. The if-guard inside _route
        // (`if (platformFee > 0)`) skips the first transferFrom.
        Secudigate g2 = new Secudigate(provider, platformRecv, 0);
        vm.prank(provider);
        g2.setTokenPriceFeed(address(mock), address(feed));

        address treasury = makeAddr("t");
        vm.prank(merchant);
        g2.registerMerchant(treasury, address(0), 0, 0);

        vm.prank(payer);
        mock.approve(address(g2), type(uint256).max);

        vm.prank(payer);
        g2.pay(_id("zero-pf"), merchant, address(mock), 100e6);

        // platformRecv received nothing — the transferFrom was skipped.
        assertEq(mock.balanceOf(platformRecv), 0, "skipped platform transfer");
        assertEq(mock.balanceOf(treasury), 100e6, "treasury got 100%");
    }

    function test_zeroMerchantFee_skipsTransferFrom() public {
        // Default setUp already has merchant fee = 0. Just verify that
        // the feeReceiver was never touched even though it's address(0).
        address treasury = makeAddr("t");
        vm.prank(merchant);
        gate.registerMerchant(treasury, address(0), 0, 0);

        vm.prank(payer);
        gate.pay(_id("zero-mf"), merchant, address(mock), 100e6);

        assertEq(mock.balanceOf(address(0)), 0, "zero address untouched");
        assertEq(mock.balanceOf(treasury), 99e6);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
