// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Reentrancy attack surface tests.
///
/// Threat model: a hostile ERC20 token can call back into Secudigate during
/// its own `transferFrom`. The contract defends with OpenZeppelin's
/// ReentrancyGuard on both `pay` and `deposit`. These tests verify the
/// guard catches every entry attempt at every point in `_route`:
///
///   - the platform-fee transferFrom
///   - the merchant-fee transferFrom
///   - the net-to-treasury transferFrom
///
/// and every cross-function combination (re-enter pay() during deposit(),
/// re-enter deposit() during pay(), etc.).
///
/// Note: SafeERC20 does NOT trigger ERC777-style receiver hooks; the only
/// reentry vector is a hostile token contract whose `transferFrom`
/// callback into Secudigate is unguarded by the token itself.

// Hostile token used by every test in this file. Configurable to attempt
// reentry at any of the three transferFrom calls _route makes, calling
// either pay() or deposit() back into the gateway.

enum ReentryTarget {
    None,
    Pay,
    Deposit
}

contract HostileToken is ERC20 {
    Secudigate public gate;

    /// At which transferFrom call do we re-enter?
    ///   0 = no re-entry (control)
    ///   1 = on the first transferFrom (platform fee)
    ///   2 = on the second (merchant fee)
    ///   3 = on the third (net to treasury)
    uint8 public reentryStage;

    /// Which function do we attempt to re-enter?
    ReentryTarget public target;

    /// Args we'll use for the reentrant call.
    bytes32 public reentryInvoiceId;
    address public reentryMerchant;
    uint256 public reentryAmount;
    string public reentryRef;

    uint8 internal callCount;
    bool internal armed;

    constructor() ERC20("Hostile", "HST") {
        _mint(msg.sender, 1_000_000e18);
    }

    function arm(
        Secudigate g,
        uint8 stage,
        ReentryTarget t,
        bytes32 invoiceId,
        address merchant,
        uint256 amount,
        string memory ref
    ) external {
        gate = g;
        reentryStage = stage;
        target = t;
        reentryInvoiceId = invoiceId;
        reentryMerchant = merchant;
        reentryAmount = amount;
        reentryRef = ref;
        callCount = 0;
        armed = true;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (armed) {
            callCount += 1;
            if (callCount == reentryStage) {
                // Single-shot: don't recurse inside the recursion.
                armed = false;
                if (target == ReentryTarget.Pay) {
                    gate.pay(reentryInvoiceId, reentryMerchant, address(this), reentryAmount);
                } else if (target == ReentryTarget.Deposit) {
                    gate.deposit(reentryMerchant, reentryRef, address(this), reentryAmount);
                }
            }
        }
        return super.transferFrom(from, to, amount);
    }
}

contract ReentrancyAttacks is Test {
    Secudigate gate;
    HostileToken hst;
    MockAggregator hstFeed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address feeReceiver = makeAddr("feeReceiver");
    address payer = makeAddr("payer");

    uint16 constant PLATFORM_BPS = 100; // 1%
    uint16 constant MERCHANT_BPS = 250; // 2.5%

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, PLATFORM_BPS);
        hst = new HostileToken();
        hstFeed = new MockAggregator(8, 1e8, "HST / USD");

        // Wire a price feed so the dailyLimit branch is exercisable.
        vm.prank(provider);
        gate.setTokenPriceFeed(address(hst), address(hstFeed));

        // Register merchant with both a platform AND a merchant fee, so
        // all three transferFrom calls inside _route execute (otherwise
        // the zero-fee branches are skipped and we can't test reentry on
        // them).
        vm.prank(merchant);
        gate.registerMerchant(treasury, feeReceiver, MERCHANT_BPS, 0);

        hst.transfer(payer, 100_000e18);
        vm.prank(payer);
        hst.approve(address(gate), type(uint256).max);
    }

    function test_reentry_pay_during_pay_platformFeeStage() public {
        hst.arm(gate, 1, ReentryTarget.Pay, _id("re-a"), merchant, 100e18, "");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-outer"), merchant, address(hst), 100e18);
    }

    function test_reentry_pay_during_pay_merchantFeeStage() public {
        hst.arm(gate, 2, ReentryTarget.Pay, _id("re-b"), merchant, 100e18, "");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-outer-b"), merchant, address(hst), 100e18);
    }

    function test_reentry_pay_during_pay_netStage() public {
        hst.arm(gate, 3, ReentryTarget.Pay, _id("re-c"), merchant, 100e18, "");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-outer-c"), merchant, address(hst), 100e18);
    }

    function test_reentry_deposit_during_pay_platformFeeStage() public {
        hst.arm(gate, 1, ReentryTarget.Deposit, bytes32(0), merchant, 100e18, "ATTACK");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-x-a"), merchant, address(hst), 100e18);
    }

    function test_reentry_deposit_during_pay_merchantFeeStage() public {
        hst.arm(gate, 2, ReentryTarget.Deposit, bytes32(0), merchant, 100e18, "ATTACK");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-x-b"), merchant, address(hst), 100e18);
    }

    function test_reentry_deposit_during_pay_netStage() public {
        hst.arm(gate, 3, ReentryTarget.Deposit, bytes32(0), merchant, 100e18, "ATTACK");
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-x-c"), merchant, address(hst), 100e18);
    }

    function test_reentry_pay_during_deposit_platformFeeStage() public {
        hst.arm(gate, 1, ReentryTarget.Pay, _id("re-y-a"), merchant, 50e18, "");
        vm.prank(payer);
        vm.expectRevert();
        gate.deposit(merchant, "OUTER", address(hst), 50e18);
    }

    function test_reentry_pay_during_deposit_netStage() public {
        hst.arm(gate, 3, ReentryTarget.Pay, _id("re-y-c"), merchant, 50e18, "");
        vm.prank(payer);
        vm.expectRevert();
        gate.deposit(merchant, "OUTER", address(hst), 50e18);
    }

    function test_reentry_deposit_during_deposit() public {
        hst.arm(gate, 2, ReentryTarget.Deposit, bytes32(0), merchant, 25e18, "INNER");
        vm.prank(payer);
        vm.expectRevert();
        gate.deposit(merchant, "OUTER", address(hst), 25e18);
    }

    function test_control_noReentry_payCompletes() public {
        hst.arm(gate, 0, ReentryTarget.None, bytes32(0), merchant, 0, "");
        vm.prank(payer);
        gate.pay(_id("clean"), merchant, address(hst), 100e18);
        // Sanity: routing happened.
        uint256 gross = 100e18;
        uint256 fees = (gross * uint256(PLATFORM_BPS + MERCHANT_BPS)) / 10_000;
        assertEq(hst.balanceOf(treasury), gross - fees);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
