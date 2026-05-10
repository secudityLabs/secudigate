// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Adversarial tests for the per-payer / per-merchant daily USD cap.
///
/// The accumulator key is (payer, merchant, dayIndex) where
/// `dayIndex = block.timestamp / 1 days`. It's token-agnostic on
/// purpose — a merchant's "$X / day per payer" cap clamps the payer's
/// total spend across every accepted token.
///
/// These tests probe:
///   - exact-cap boundaries (one wei over reverts)
///   - day rollover at the UTC boundary
///   - per-(payer, merchant) isolation (other payers / merchants unaffected)
///   - multi-token accumulation in the same day
///   - lowering the cap mid-day (existing total preserved; new payments
///     measured against the new lower cap)
///   - disabling the cap mid-day (future payments unrestricted)
///   - capped merchant with NO feed for the token → reverts
///   - the paidUsd6Today view stays consistent

contract Mock6A is ERC20 {
    constructor() ERC20("MockA", "MKA") {
        _mint(msg.sender, 1_000_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract Mock6B is ERC20 {
    constructor() ERC20("MockB", "MKB") {
        _mint(msg.sender, 1_000_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract DailyLimitAttacks is Test {
    Secudigate gate;
    Mock6A mockA;
    Mock6B mockB;
    MockAggregator feedA;
    MockAggregator feedB;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address merchant2 = makeAddr("merchant2");
    address treasury = makeAddr("treasury");
    address treasury2 = makeAddr("treasury2");
    address payer = makeAddr("payer");
    address payer2 = makeAddr("payer2");

    int256 constant ONE_USD_8DP = 1e8;
    uint256 constant CAP_USD6 = 1_000_000_000; // $1000

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 0); // 0% platform fee, isolates cap math
        mockA = new Mock6A();
        mockB = new Mock6B();
        feedA = new MockAggregator(8, ONE_USD_8DP, "MKA / USD");
        feedB = new MockAggregator(8, ONE_USD_8DP, "MKB / USD");

        vm.startPrank(provider);
        gate.setTokenPriceFeed(address(mockA), address(feedA));
        gate.setTokenPriceFeed(address(mockB), address(feedB));
        vm.stopPrank();

        vm.prank(merchant);
        gate.registerMerchant(treasury, address(0), 0, CAP_USD6); // $1000/payer/day

        vm.prank(merchant2);
        gate.registerMerchant(treasury2, address(0), 0, CAP_USD6);

        mockA.transfer(payer, 100_000e6);
        mockA.transfer(payer2, 100_000e6);
        mockB.transfer(payer, 100_000e6);
        vm.startPrank(payer);
        mockA.approve(address(gate), type(uint256).max);
        mockB.approve(address(gate), type(uint256).max);
        vm.stopPrank();
        vm.prank(payer2);
        mockA.approve(address(gate), type(uint256).max);
    }

    function test_payExactlyAtCap_passes() public {
        // $1000 in 6-dec tokens at $1.00 = 1000e6 wei.
        vm.prank(payer);
        gate.pay(_id("at-cap"), merchant, address(mockA), 1000e6);
        assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6);
    }

    function test_oneWeiOverCap_reverts() public {
        // $999.99 + the smallest possible token amount that maps to a
        // non-zero USD value. For our setup, 1 wei of a 6-dec $1 token =
        // 1 microUSD = 1 USD-6dp wei. So one extra wei = $0.000001 USD,
        // which trips the cap by exactly 1.
        vm.prank(payer);
        gate.pay(_id("almost"), merchant, address(mockA), 1000e6 - 1);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.DailyLimitExceeded.selector, CAP_USD6, CAP_USD6 + 1));
        gate.pay(_id("over"), merchant, address(mockA), 2);
    }

    function test_capResetsAtNextUtcDay() public {
        // Hit the cap exactly.
        vm.prank(payer);
        gate.pay(_id("d1-1"), merchant, address(mockA), CAP_USD6);

        // Cap should be tracked for today's day index.
        uint256 today = block.timestamp / 1 days;
        assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6);

        // Advance to the start of the next UTC day. Refresh the feed
        // so the staleness check doesn't fire — in reality, Chainlink
        // posts a fresh round every heartbeat.
        vm.warp((today + 1) * 1 days);
        feedA.setAnswer(ONE_USD_8DP);

        // Today's accumulator now reads zero (fresh day).
        assertEq(gate.paidUsd6Today(payer, merchant), 0, "next-day accumulator zero");

        // Another full cap's worth goes through cleanly.
        vm.prank(payer);
        gate.pay(_id("d2-1"), merchant, address(mockA), CAP_USD6);
        assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6);
    }

    function test_capDoesNotResetMidDay() public {
        // Spend $999. Warp by 23 hours (still same UTC day, depending
        // on starting block.timestamp). Even at 23h, the accumulator
        // should not have reset.
        vm.prank(payer);
        gate.pay(_id("23h-1"), merchant, address(mockA), 999e6);

        // Advance 23 hours. May or may not cross UTC boundary depending
        // on starting timestamp — so we explicitly stay in same dayIndex.
        uint256 originalDay = block.timestamp / 1 days;
        uint256 lateInSameDay = originalDay * 1 days + 23 hours;
        if (lateInSameDay > block.timestamp) {
            vm.warp(lateInSameDay);
            feedA.setAnswer(ONE_USD_8DP); // refresh feed past staleness window
            // We didn't roll over.
            uint256 leftover = 1e6; // $1
            vm.prank(payer);
            gate.pay(_id("23h-2"), merchant, address(mockA), leftover);
            assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6);
        }
    }

    function test_capIsPerPayer_otherPayersUnaffected() public {
        // payer maxes out the cap.
        vm.prank(payer);
        gate.pay(_id("p1"), merchant, address(mockA), CAP_USD6);
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("p1-over"), merchant, address(mockA), 1e6);

        // payer2 still has a full $1000.
        vm.prank(payer2);
        gate.pay(_id("p2"), merchant, address(mockA), CAP_USD6);
        assertEq(gate.paidUsd6Today(payer2, merchant), CAP_USD6);
    }

    function test_capIsPerMerchant_otherMerchantsUnaffected() public {
        // Same payer hits merchant's cap.
        vm.prank(payer);
        gate.pay(_id("m1"), merchant, address(mockA), CAP_USD6);
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("m1-over"), merchant, address(mockA), 1e6);

        // Same payer still has a full $1000 at merchant2.
        vm.prank(payer);
        gate.pay(_id("m2"), merchant2, address(mockA), CAP_USD6);
        assertEq(gate.paidUsd6Today(payer, merchant2), CAP_USD6);
    }

    function test_capAccumulatesAcrossTokens() public {
        // $600 in token A …
        vm.prank(payer);
        gate.pay(_id("a"), merchant, address(mockA), 600e6);
        // … and $400 in token B fills the cap exactly.
        vm.prank(payer);
        gate.pay(_id("b"), merchant, address(mockB), 400e6);

        assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6, "tokens accumulated together");

        // $0.01 in either token should now revert.
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("over-a"), merchant, address(mockA), 1e4);
        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("over-b"), merchant, address(mockB), 1e4);
    }

    function test_loweringCapMidDay_preservesPastSpend_blocksNew() public {
        // Spend $600 against the original $1000 cap.
        vm.prank(payer);
        gate.pay(_id("pre"), merchant, address(mockA), 600e6);
        assertEq(gate.paidUsd6Today(payer, merchant), 600_000_000);

        // Merchant lowers the cap to $500. The $600 already spent is
        // grandfathered — the contract doesn't claw it back — but any new
        // payment (no matter how small) blows the new cap.
        vm.prank(merchant);
        gate.setMerchantDailyLimit(500_000_000); // $500

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Secudigate.DailyLimitExceeded.selector,
                500_000_000, // new limit
                600_000_000 + 1 // existing + 1 wei
            )
        );
        gate.pay(_id("post-lower"), merchant, address(mockA), 1);
    }

    function test_disablingCapMidDay_futurePaymentsUnrestricted() public {
        // Hit the cap.
        vm.prank(payer);
        gate.pay(_id("hit"), merchant, address(mockA), CAP_USD6);

        // Disable the cap.
        vm.prank(merchant);
        gate.setMerchantDailyLimit(0);

        // Now arbitrary amounts go through; accumulator is no longer
        // updated (cap=0 short-circuits the whole `if`).
        vm.prank(payer);
        gate.pay(_id("free"), merchant, address(mockA), 50_000e6);

        // The view still reports the old $1000 total (the cap-0 branch
        // doesn't touch the accumulator).
        assertEq(gate.paidUsd6Today(payer, merchant), CAP_USD6, "accumulator stays frozen");
    }

    function test_cappedMerchant_withNoFeedForToken_reverts() public {
        // Admin removes the feed.
        vm.prank(provider);
        gate.removeTokenPriceFeed(address(mockA));

        // payer can't pay because cap > 0 requires a feed.
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PriceFeedNotConfigured.selector, address(mockA)));
        gate.pay(_id("no-feed"), merchant, address(mockA), 1e6);
    }

    function test_paidUsd6Today_consistencyWithSequentialPays() public {
        uint256 total;
        for (uint256 i; i < 5; i++) {
            uint256 amount = (i + 1) * 10e6; // 10, 20, 30, 40, 50 → $150 total
            vm.prank(payer);
            gate.pay(_id(string(abi.encodePacked("seq-", i))), merchant, address(mockA), amount);
            total += amount;
            assertEq(gate.paidUsd6Today(payer, merchant), total, "view tracks each pay");
        }
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
