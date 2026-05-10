// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Fuzz + invariant tests for Secudigate.
///
/// Two kinds of properties:
///
///   (a) **Property-based fuzz** — for any random (merchant, payer, amount,
///       token, fee config) tuple, the routing math always sums to the
///       gross amount and never overshoots the configured fee caps.
///
///   (b) **Invariants** — global properties that must hold across an entire
///       randomized sequence of operations. The big one for this contract:
///       *the gateway never holds tokens*. Three direct transferFroms in
///       a single call; no balance should ever accumulate on the contract.
///
/// Note: invariant testing uses an external handler so Forge can randomize
/// across a constrained API. The handler restricts to "legal" operations
/// (registered merchants, valid amounts, etc.) so we test the legit
/// state space, not random reverts.

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

// Property-based fuzz tests

contract SecudigateFuzz is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address feeReceiver = makeAddr("feeReceiver");
    address payer = makeAddr("payer");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100); // 1% platform fee
        mock = new Mock6();
        feed = new MockAggregator(8, 1e8, "MK / USD");

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));

        mock.transfer(payer, 1_000_000_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
    }

    /// Bound the fuzz amount to the payer's actual pre-funded balance so
    /// every run is exercisable. The setUp transfers `1e15` wei (one
    /// billion tokens at 6 decimals) to the payer.
    uint256 internal constant MAX_FUZZ_AMOUNT = 1_000_000_000e6;

    /// For any valid (merchantFeeBps, amount), the three routed components
    /// (platformFee, merchantFee, netToTreasury) sum to the gross.
    function testFuzz_feeMath_sumsToGross(uint16 merchantBps, uint256 amount) public {
        merchantBps = uint16(bound(merchantBps, 0, gate.MAX_MERCHANT_FEE_BPS()));
        amount = bound(amount, 1, MAX_FUZZ_AMOUNT);

        vm.prank(merchant);
        gate.registerMerchant(treasury, merchantBps > 0 ? feeReceiver : address(0), merchantBps, 0);

        (uint256 pFee, uint256 mFee, uint256 net) = gate.quote(merchant, amount);
        assertEq(pFee + mFee + net, amount, "components don't sum to gross");
    }

    /// Fee components never exceed their declared caps.
    function testFuzz_feeMath_respectsCaps(uint16 merchantBps, uint256 amount) public {
        merchantBps = uint16(bound(merchantBps, 0, gate.MAX_MERCHANT_FEE_BPS()));
        amount = bound(amount, 1, MAX_FUZZ_AMOUNT);

        vm.prank(merchant);
        gate.registerMerchant(treasury, merchantBps > 0 ? feeReceiver : address(0), merchantBps, 0);

        (uint256 pFee, uint256 mFee,) = gate.quote(merchant, amount);

        // Each fee is computed via amount * bps / 10_000 (floor), so for
        // every input it must be ≤ amount * MAX_*_BPS / 10_000.
        assertLe(pFee, (amount * gate.MAX_PLATFORM_FEE_BPS()) / 10_000, "platform fee exceeds cap");
        assertLe(mFee, (amount * gate.MAX_MERCHANT_FEE_BPS()) / 10_000, "merchant fee exceeds cap");
    }

    /// For any payment, the contract NEVER accumulates a balance — three
    /// direct transferFroms from payer to recipients, contract on neither
    /// side.
    function testFuzz_pay_noCustody(uint256 amount) public {
        amount = bound(amount, 1, MAX_FUZZ_AMOUNT);

        vm.prank(merchant);
        gate.registerMerchant(treasury, feeReceiver, 250, 0); // 2.5% merchant fee

        uint256 contractBalanceBefore = mock.balanceOf(address(gate));
        vm.prank(payer);
        gate.pay(_id(amount), merchant, address(mock), amount);
        uint256 contractBalanceAfter = mock.balanceOf(address(gate));

        assertEq(contractBalanceBefore, contractBalanceAfter, "contract held tokens");
        assertEq(mock.balanceOf(address(gate)), 0, "contract balance non-zero");
    }

    /// Payment with `amount > 0` is always either:
    ///   - fully accepted (all three recipients credited)
    ///   - cleanly reverted (no partial state change visible to outside)
    function testFuzz_pay_atomic_orRevert(uint256 amount, uint16 merchantBps) public {
        merchantBps = uint16(bound(merchantBps, 0, gate.MAX_MERCHANT_FEE_BPS()));
        amount = bound(amount, 1, MAX_FUZZ_AMOUNT);

        vm.prank(merchant);
        gate.registerMerchant(treasury, merchantBps > 0 ? feeReceiver : address(0), merchantBps, 0);

        uint256 platformBefore = mock.balanceOf(platformRecv);
        uint256 merchantBefore = mock.balanceOf(merchantBps > 0 ? feeReceiver : treasury);
        uint256 treasuryBefore = mock.balanceOf(treasury);
        uint256 payerBefore = mock.balanceOf(payer);

        vm.prank(payer);
        gate.pay(_id(amount), merchant, address(mock), amount);

        // No partial credit: payer's delta == platform+merchant+treasury deltas.
        uint256 payerSpent = payerBefore - mock.balanceOf(payer);
        uint256 platformGained = mock.balanceOf(platformRecv) - platformBefore;
        uint256 treasuryGained = mock.balanceOf(treasury) - treasuryBefore;
        uint256 merchantFeeGained = merchantBps > 0 ? (mock.balanceOf(feeReceiver) - merchantBefore) : 0;

        assertEq(payerSpent, amount, "payer's deduction == gross");
        assertEq(platformGained + merchantFeeGained + treasuryGained, amount, "splits sum to gross");
    }

    function _id(uint256 seed) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked("inv-fuzz", seed));
    }
}

// Invariant testing — a handler restricts the API surface to legal ops.

contract InvariantHandler is Test {
    Secudigate public gate;
    Mock6 public mock;

    address public platformRecv;
    address public merchant;
    address public treasury;
    address public feeReceiver;
    address public payer;

    uint256 public payCount;

    constructor(
        Secudigate _gate,
        Mock6 _mock,
        address _platformRecv,
        address _merchant,
        address _treasury,
        address _feeReceiver,
        address _payer
    ) {
        gate = _gate;
        mock = _mock;
        platformRecv = _platformRecv;
        merchant = _merchant;
        treasury = _treasury;
        feeReceiver = _feeReceiver;
        payer = _payer;
    }

    function pay(uint256 amount, uint96 idSeed) external {
        amount = bound(amount, 1, 10_000_000e6); // sub-trillion notional
        if (mock.balanceOf(payer) < amount) return; // skip — payer ran out
        bytes32 id = keccak256(abi.encodePacked("inv-h", idSeed, payCount));
        vm.prank(payer);
        try gate.pay(id, merchant, address(mock), amount) {
            payCount += 1;
        } catch {
            // Replay protection / paused / etc. — ignored, we're invariant-testing the success path.
        }
    }

    function depositRandom(uint256 amount, string memory ref) external {
        amount = bound(amount, 1, 10_000_000e6);
        if (mock.balanceOf(payer) < amount) return;
        vm.prank(payer);
        try gate.deposit(merchant, ref, address(mock), amount) {} catch {}
    }

    function setMerchantFee(uint16 bps) external {
        bps = uint16(bound(bps, 0, gate.MAX_MERCHANT_FEE_BPS()));
        address fr = bps > 0 ? feeReceiver : address(0);
        vm.prank(merchant);
        try gate.setMerchantFee(fr, bps) {} catch {}
    }
}

contract SecudigateInvariants is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;
    InvariantHandler handler;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address feeReceiver = makeAddr("feeReceiver");
    address payer = makeAddr("payer");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100);
        mock = new Mock6();
        feed = new MockAggregator(8, 1e8, "MK / USD");

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));

        vm.prank(merchant);
        gate.registerMerchant(treasury, feeReceiver, 250, 0);

        mock.transfer(payer, 1_000_000_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);

        handler = new InvariantHandler(gate, mock, platformRecv, merchant, treasury, feeReceiver, payer);
        targetContract(address(handler));
    }

    /// The contract never accumulates a token balance across any sequence
    /// of operations the handler can drive. This is the single most
    /// important property of a non-custodial gateway.
    function invariant_noCustody() public view {
        assertEq(mock.balanceOf(address(gate)), 0, "gateway holds tokens");
    }

    /// Total tokens in circulation are conserved — the supply minted in
    /// setUp equals what's currently in the system. Catches accidental
    /// burns or extra mints from buggy fee math.
    function invariant_supplyConserved() public view {
        uint256 sum = mock.balanceOf(payer) + mock.balanceOf(platformRecv) + mock.balanceOf(treasury)
            + mock.balanceOf(feeReceiver) + mock.balanceOf(address(gate)) + mock.balanceOf(address(this)); // setUp held the initial supply briefly
        assertEq(sum, mock.totalSupply(), "supply not conserved");
    }

    /// The accumulator can only grow within a day. The handler never
    /// warps time, so we expect non-decreasing usage — but the merchant's
    /// cap is 0 (disabled) in this run, so paidUsd6Today stays 0. The
    /// invariant exists to fail LOUDLY if someone adds time-warping to
    /// the handler without revisiting the property.
    function invariant_dailyAccumulator_zeroWhenCapDisabled() public view {
        assertEq(
            gate.paidUsd6Today(payer, merchant),
            0,
            "accumulator should stay 0 when dailyLimitUsd6 == 0 (no cap = no tracking)"
        );
    }
}
