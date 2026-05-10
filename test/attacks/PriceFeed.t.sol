// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {AggregatorV3Interface} from "../../src/interfaces/AggregatorV3Interface.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Chainlink price feed adversarial cases.
///
/// _route() converts each token amount to USD-6dp via the configured
/// aggregator before applying the per-payer daily cap. The conversion
/// formula is:
///
///   usd6 = (amount * answer * 1e6) / (10**tokenDec * 10**feedDec)
///
/// Things that can go wrong:
///   - answer ≤ 0 (sentinel for "no data")
///   - feed staleness (heartbeat passed)
///   - feed swap mid-block (admin pulls the rug)
///   - extreme tokenDec / feedDec causing arithmetic overflow
///   - oracle returning the same `updatedAt` forever (zombie feed)
///   - boundary case: updatedAt exactly at the staleness cutoff
///
/// These tests verify the contract reverts loudly in every case where
/// the price is untrustworthy, instead of silently letting through
/// payments that bypass the daily cap.

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

contract PriceFeedAttacks is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address payer = makeAddr("payer");

    int256 constant ONE_USD_8DP = 1e8;

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100);
        mock = new Mock6();
        feed = new MockAggregator(8, ONE_USD_8DP, "MK / USD");

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));

        // Daily cap is enabled in every test; otherwise the contract
        // wouldn't touch the price feed at all.
        vm.prank(merchant);
        gate.registerMerchant(treasury, address(0), 0, 1_000_000_000); // $1000

        mock.transfer(payer, 100_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
    }

    function test_negativeAnswer_reverts() public {
        feed.setAnswer(-1);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.InvalidPrice.selector, int256(-1)));
        gate.pay(_id("neg"), merchant, address(mock), 1e6);
    }

    function test_zeroAnswer_reverts() public {
        feed.setAnswer(0);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.InvalidPrice.selector, int256(0)));
        gate.pay(_id("zero"), merchant, address(mock), 1e6);
    }

    function test_minIntAnswer_reverts() public {
        feed.setAnswer(type(int256).min);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.InvalidPrice.selector, type(int256).min));
        gate.pay(_id("min"), merchant, address(mock), 1e6);
    }

    function test_exactStalenessBoundary_passes() public {
        // STALE_AFTER = 1 hour. Set updatedAt = now - 3600 (exactly the
        // boundary). The contract uses `>` (strictly greater than), so
        // exactly-at-boundary still verifies.
        vm.warp(2 hours);
        feed.setUpdatedAt(block.timestamp - 1 hours);

        vm.prank(payer);
        gate.pay(_id("boundary-ok"), merchant, address(mock), 1e6);
    }

    function test_oneSecondPastStaleness_reverts() public {
        vm.warp(2 hours);
        uint256 ts = block.timestamp - (1 hours + 1);
        feed.setUpdatedAt(ts);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.StalePrice.selector, address(mock), ts));
        gate.pay(_id("stale"), merchant, address(mock), 1e6);
    }

    function test_futureUpdatedAt_passes() public {
        // A feed that reports an updatedAt in the future (perhaps due to
        // a clock-drift bug on the oracle's side) doesn't trip the
        // staleness check, because `block.timestamp > updatedAt + STALE`
        // is false. Documents the behavior — not exploitable, just worth
        // knowing.
        feed.setUpdatedAt(block.timestamp + 1 hours);

        vm.prank(payer);
        gate.pay(_id("future"), merchant, address(mock), 1e6);
    }

    function test_adminSwapsFeedToInflatedPrice_capStillEnforced() public {
        // Cap = $1000. Customer pays $500 worth of MK at the real price.
        vm.prank(payer);
        gate.pay(_id("first"), merchant, address(mock), 500e6);
        assertEq(gate.paidUsd6Today(payer, merchant), 500_000_000);

        // Now admin swaps the feed to one that reports $100 per token.
        // The customer's *second* $500-worth (at the new price) is now
        // worth $50_000 in USD-6dp terms — should blow the cap.
        MockAggregator pumped = new MockAggregator(8, 100 * ONE_USD_8DP, "MK pumped");
        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(pumped));

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(
                Secudigate.DailyLimitExceeded.selector,
                1_000_000_000, // limit
                500_000_000 + 50_000_000_000 // would-be total
            )
        );
        gate.pay(_id("second"), merchant, address(mock), 500e6);
    }

    function test_adminRemovesFeed_payRevertsForCappedMerchant() public {
        // With cap > 0, removing the feed must lock payments — the cap
        // can't be enforced without a price.
        vm.prank(provider);
        gate.removeTokenPriceFeed(address(mock));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PriceFeedNotConfigured.selector, address(mock)));
        gate.pay(_id("no-feed"), merchant, address(mock), 1e6);
    }

    function test_largeFeedDecimals_overflowsAndReverts() public {
        // Re-deploy a feed with `decimals = 78`. The conversion does
        // `10 ** feedDec`, which for 78 produces ~1e78 (uint256 max is
        // ~1.16e77). Solidity 0.8 reverts on overflow.
        MockAggregator wide = new MockAggregator(78, 1, "wide");
        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(wide));

        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("ovf"), merchant, address(mock), 1e6);
    }

    function test_zeroFeedDecimals_passesArithmetic() public {
        // decimals = 0: divisor 10**0 = 1, so usd6 = amount * answer * 1e6
        // / (10**tokenDec). With answer = 1, tokenDec = 6:
        //   usd6 = 1e6 * 1 * 1e6 / 1e6 = 1e6   ($1.00)
        MockAggregator d0 = new MockAggregator(0, 1, "d0");
        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(d0));

        vm.prank(payer);
        gate.pay(_id("d0"), merchant, address(mock), 1e6);
        // Accumulator should read $1.00 of usage.
        assertEq(gate.paidUsd6Today(payer, merchant), 1_000_000);
    }

    function test_quoteUsd6_priceFeedNotConfigured_reverts() public {
        // Random token without a feed.
        address random = makeAddr("rnd");
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PriceFeedNotConfigured.selector, random));
        gate.quoteUsd6(random, 1);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
