// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../src/Secudigate.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockSanctionsList} from "../src/mocks/MockSanctionsList.sol";
import {AggregatorV3Interface} from "../src/interfaces/AggregatorV3Interface.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {IAccessControl} from "@openzeppelin-contracts/access/IAccessControl.sol";
import {Pausable} from "@openzeppelin-contracts/utils/Pausable.sol";

contract MockUSD is ERC20 {
    uint8 private immutable _dec;

    constructor(string memory n, string memory s, uint8 d) ERC20(n, s) {
        _dec = d;
    }

    function decimals() public view override returns (uint8) {
        return _dec;
    }

    function mint(address to, uint256 amt) external {
        _mint(to, amt);
    }
}

/// @dev Reentrant token used to verify nonReentrant guards on pay/deposit.
contract ReentrantToken is ERC20 {
    Secudigate public gate;
    bool public attack;
    bytes32 public reentrantInvoiceId;
    address public reentrantMerchant;
    uint256 public reentrantAmount;

    constructor() ERC20("Reentrant", "RNT") {
        _mint(msg.sender, 1_000_000e18);
    }

    function arm(Secudigate g, bytes32 id, address m, uint256 a) external {
        gate = g;
        attack = true;
        reentrantInvoiceId = id;
        reentrantMerchant = m;
        reentrantAmount = a;
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        if (attack) {
            attack = false; // single-shot
            // Try to re-enter pay() — should revert with ReentrancyGuardReentrantCall.
            gate.pay(reentrantInvoiceId, reentrantMerchant, address(this), reentrantAmount);
        }
        return super.transferFrom(from, to, amount);
    }
}

contract SecudigateTest is Test {
    Secudigate gate;
    MockUSD usdc;
    MockUSD usdt;
    MockUSD dai;

    MockAggregator usdcFeed;
    MockAggregator usdtFeed;
    MockAggregator daiFeed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address feeReceiver = makeAddr("feeReceiver");
    address payer = makeAddr("payer");
    address payerB = makeAddr("payerB");

    // 1.00% platform fee, 2.50% merchant fee — within caps
    uint16 constant PLATFORM_BPS = 100;
    uint16 constant MERCHANT_BPS = 250;

    // Chainlink USD feeds use 8 decimals; $1.00 = 1e8.
    int256 constant ONE_USD_8DP = 1e8;

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, PLATFORM_BPS);
        usdc = new MockUSD("USD Coin", "USDC", 6);
        usdt = new MockUSD("Tether", "USDT", 6);
        dai = new MockUSD("Dai", "DAI", 18);

        usdcFeed = new MockAggregator(8, ONE_USD_8DP, "USDC / USD");
        usdtFeed = new MockAggregator(8, ONE_USD_8DP, "USDT / USD");
        daiFeed = new MockAggregator(8, ONE_USD_8DP, "DAI / USD");

        vm.startPrank(provider);
        gate.setTokenPriceFeed(address(usdc), address(usdcFeed));
        gate.setTokenPriceFeed(address(usdt), address(usdtFeed));
        gate.setTokenPriceFeed(address(dai), address(daiFeed));
        vm.stopPrank();

        usdc.mint(payer, 1_000_000e6);
        usdc.mint(payerB, 1_000_000e6);
        usdt.mint(payer, 1_000_000e6);
        dai.mint(payer, 1_000_000e18);

        vm.prank(merchant);
        gate.registerMerchant(
            treasury,
            feeReceiver,
            MERCHANT_BPS,
            0 /* no daily limit */
        );

        vm.prank(payer);
        usdc.approve(address(gate), type(uint256).max);
        vm.prank(payerB);
        usdc.approve(address(gate), type(uint256).max);
        vm.prank(payer);
        usdt.approve(address(gate), type(uint256).max);
        vm.prank(payer);
        dai.approve(address(gate), type(uint256).max);
    }

    function test_constructor_storesValues() public view {
        assertEq(gate.secudigate(), platformRecv);
        assertEq(gate.secudigateFeeBps(), PLATFORM_BPS);
        assertEq(gate.owner(), provider);
        assertTrue(gate.isAdmin(provider), "owner is initial admin");
        assertTrue(gate.hasRole(gate.ADMIN_ROLE(), provider));
    }

    function test_constructor_revertsOnZeroOwner() public {
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableInvalidOwner.selector, address(0)));
        new Secudigate(address(0), platformRecv, PLATFORM_BPS);
    }

    function test_constructor_revertsOnZeroPlatformReceiver() public {
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        new Secudigate(provider, address(0), PLATFORM_BPS);
    }

    function test_constructor_revertsOnExcessivePlatformFee() public {
        uint16 max = gate.MAX_PLATFORM_FEE_BPS();
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PlatformFeeTooHigh.selector, max));
        new Secudigate(provider, platformRecv, max + 1);
    }

    function test_setSecudigate_onlyAdmin() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();

        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, merchant, ADMIN)
        );
        gate.setSecudigate(address(0xBEEF));

        vm.prank(provider);
        gate.setSecudigate(address(0xBEEF));
        assertEq(gate.secudigate(), address(0xBEEF));
    }

    function test_setSecudigateFeeBps_capped() public {
        uint16 max = gate.MAX_PLATFORM_FEE_BPS();
        vm.prank(provider);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PlatformFeeTooHigh.selector, max));
        gate.setSecudigateFeeBps(max + 1);

        vm.prank(provider);
        gate.setSecudigateFeeBps(max);
        assertEq(gate.secudigateFeeBps(), max);
    }

    function test_pause_unpause_onlyAdmin() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();

        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, merchant, ADMIN)
        );
        gate.pause();

        vm.prank(provider);
        gate.pause();
        assertTrue(gate.paused());

        vm.prank(provider);
        gate.unpause();
        assertFalse(gate.paused());
    }

    function test_addAdmin_byOwner_grantsRole() public {
        address ops = makeAddr("ops");
        vm.prank(provider);
        gate.addAdmin(ops);
        assertTrue(gate.isAdmin(ops));

        vm.prank(ops);
        gate.setSecudigateFeeBps(150);
        assertEq(gate.secudigateFeeBps(), 150);
    }

    function test_addAdmin_revertsForNonOwner() public {
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, merchant));
        gate.addAdmin(makeAddr("attacker"));
    }

    function test_addAdmin_revertsOnZeroAddress() public {
        vm.prank(provider);
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        gate.addAdmin(address(0));
    }

    function test_removeAdmin_byOwner_revokesRole() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        address ops = makeAddr("ops");
        vm.prank(provider);
        gate.addAdmin(ops);
        vm.prank(provider);
        gate.removeAdmin(ops);

        assertFalse(gate.isAdmin(ops));

        vm.prank(ops);
        vm.expectRevert(abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, ops, ADMIN));
        gate.setSecudigateFeeBps(150);
    }

    function test_removeAdmin_revertsForNonOwner() public {
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, merchant));
        gate.removeAdmin(provider);
    }

    function test_grantRole_throughStandardPath_isLockedOut() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        bytes32 DEFAULT_ADMIN = gate.DEFAULT_ADMIN_ROLE();
        address rando = makeAddr("rando");
        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, provider, DEFAULT_ADMIN)
        );
        gate.grantRole(ADMIN, rando);
    }

    function test_transferOwnership_movesControlAndAdminRole() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        address newOwner = makeAddr("newOwner");

        vm.prank(provider);
        gate.transferOwnership(newOwner);
        assertEq(gate.owner(), newOwner);
        assertFalse(gate.isAdmin(provider), "old owner loses admin role");
        assertTrue(gate.isAdmin(newOwner), "new owner gains admin role");

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, provider, ADMIN)
        );
        gate.setSecudigateFeeBps(50);

        vm.prank(newOwner);
        gate.setSecudigateFeeBps(50);
        assertEq(gate.secudigateFeeBps(), 50);
    }

    function test_transferOwnership_doesNotAffectOtherAdmins() public {
        address ops = makeAddr("ops");
        address newOwner = makeAddr("newOwner");

        vm.prank(provider);
        gate.addAdmin(ops);
        vm.prank(provider);
        gate.transferOwnership(newOwner);

        assertTrue(gate.isAdmin(ops));
        vm.prank(ops);
        gate.setSecudigateFeeBps(75);
        assertEq(gate.secudigateFeeBps(), 75);
    }

    function test_transferOwnership_onlyOwner() public {
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, merchant));
        gate.transferOwnership(makeAddr("attacker"));
    }

    function test_renounceOwnership_revokesAdminFromOwner() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        vm.prank(provider);
        gate.renounceOwnership();
        assertEq(gate.owner(), address(0));
        assertFalse(gate.isAdmin(provider), "renouncing owner loses admin");

        vm.prank(provider);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, provider, ADMIN)
        );
        gate.setSecudigateFeeBps(50);

        // Merchants still operate independently.
        vm.prank(payer);
        gate.pay(_id("after-renounce"), merchant, address(usdc), 100e6);
    }

    function test_renounceOwnership_otherAdminsKeepPower() public {
        address ops = makeAddr("ops");
        vm.prank(provider);
        gate.addAdmin(ops);
        vm.prank(provider);
        gate.renounceOwnership();

        assertTrue(gate.isAdmin(ops));
        vm.prank(ops);
        gate.setSecudigateFeeBps(75);
        assertEq(gate.secudigateFeeBps(), 75);

        vm.prank(ops);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, ops));
        gate.addAdmin(makeAddr("ops2"));
    }

    function test_registerMerchant_self_storesAll() public {
        address newMerchant = makeAddr("newM");
        vm.prank(newMerchant);
        gate.registerMerchant(
            treasury,
            feeReceiver,
            50,
            25_000_000 /* $25 USD */
        );

        (address t, address fr, uint16 fb, uint256 lim, bool reg, bool pa) = gate.merchants(newMerchant);
        assertEq(t, treasury);
        assertEq(fr, feeReceiver);
        assertEq(fb, 50);
        assertEq(lim, 25_000_000);
        assertTrue(reg);
        assertFalse(pa);
    }

    function test_registerMerchant_revertsOnZeroTreasury() public {
        vm.prank(makeAddr("m2"));
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        gate.registerMerchant(address(0), feeReceiver, 0, 0);
    }

    function test_registerMerchant_allowsZeroFeeReceiverWhenFeeZero() public {
        address m = makeAddr("m3");
        vm.prank(m);
        gate.registerMerchant(treasury, address(0), 0, 0);
    }

    function test_registerMerchant_revertsOnFeeWithoutReceiver() public {
        vm.prank(makeAddr("m4"));
        vm.expectRevert(Secudigate.FeeReceiverRequired.selector);
        gate.registerMerchant(treasury, address(0), 100, 0);
    }

    function test_registerMerchant_revertsOnExcessiveFee() public {
        uint16 max = gate.MAX_MERCHANT_FEE_BPS();
        vm.prank(makeAddr("m5"));
        vm.expectRevert(abi.encodeWithSelector(Secudigate.MerchantFeeTooHigh.selector, max));
        gate.registerMerchant(treasury, feeReceiver, max + 1, 0);
    }

    function test_registerMerchant_revertsWhenGloballyPaused() public {
        vm.prank(provider);
        gate.pause();
        vm.prank(makeAddr("m6"));
        vm.expectRevert(Pausable.EnforcedPause.selector);
        gate.registerMerchant(treasury, feeReceiver, 0, 0);
    }

    function test_setMerchantTreasury_onlyMerchant() public {
        vm.prank(provider);
        vm.expectRevert(Secudigate.CallerNotMerchant.selector);
        gate.setMerchantTreasury(address(0xCAFE));

        vm.prank(merchant);
        gate.setMerchantTreasury(address(0xCAFE));
        (address t,,,,,) = gate.merchants(merchant);
        assertEq(t, address(0xCAFE));
    }

    function test_setMerchantFee_capped() public {
        uint16 max = gate.MAX_MERCHANT_FEE_BPS();
        vm.prank(merchant);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.MerchantFeeTooHigh.selector, max));
        gate.setMerchantFee(feeReceiver, max + 1);
    }

    function test_setMerchantPaused_isolatesThisMerchant() public {
        address m2 = makeAddr("m2");
        address t2 = makeAddr("t2");
        vm.prank(m2);
        gate.registerMerchant(t2, address(0), 0, 0);

        vm.prank(merchant);
        gate.setMerchantPaused(true);

        vm.prank(payer);
        vm.expectRevert(Secudigate.MerchantPausedError.selector);
        gate.pay(_id("m1-blocked"), merchant, address(usdc), 100e6);

        vm.prank(payer);
        gate.pay(_id("m2-ok"), m2, address(usdc), 100e6);
    }

    function test_pay_routesAllThreeWaysWithCorrectAmounts() public {
        uint256 amount = 1_000e6;
        uint256 expPlatform = (amount * PLATFORM_BPS) / 10_000;
        uint256 expMerchant = (amount * MERCHANT_BPS) / 10_000;
        uint256 expTreasury = amount - expPlatform - expMerchant;

        uint256 payerBefore = usdc.balanceOf(payer);

        vm.prank(payer);
        gate.pay(_id("inv-1"), merchant, address(usdc), amount);

        assertEq(usdc.balanceOf(platformRecv), expPlatform, "platform");
        assertEq(usdc.balanceOf(feeReceiver), expMerchant, "merchant fee");
        assertEq(usdc.balanceOf(treasury), expTreasury, "treasury");
        assertEq(usdc.balanceOf(payer), payerBefore - amount, "payer drained");
        assertEq(usdc.balanceOf(address(gate)), 0, "no custody");
    }

    function test_pay_replayReverts() public {
        bytes32 id = _id("dup");
        vm.prank(payer);
        gate.pay(id, merchant, address(usdc), 100e6);

        vm.prank(payer);
        vm.expectRevert(Secudigate.InvoiceAlreadyPaid.selector);
        gate.pay(id, merchant, address(usdc), 100e6);
    }

    function test_pay_revertsForUnregisteredMerchant() public {
        vm.prank(payer);
        vm.expectRevert(Secudigate.MerchantNotRegistered.selector);
        gate.pay(_id("ghost"), makeAddr("ghost"), address(usdc), 100e6);
    }

    function test_pay_revertsWhenGloballyPaused() public {
        vm.prank(provider);
        gate.pause();
        vm.prank(payer);
        vm.expectRevert(Pausable.EnforcedPause.selector);
        gate.pay(_id("paused"), merchant, address(usdc), 100e6);
    }

    function test_pay_revertsZeroAmount() public {
        vm.prank(payer);
        vm.expectRevert(Secudigate.ZeroAmount.selector);
        gate.pay(_id("zero"), merchant, address(usdc), 0);
    }

    function test_pay_revertsZeroToken() public {
        vm.prank(payer);
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        gate.pay(_id("zerotok"), merchant, address(0), 100e6);
    }

    function test_deposit_routesAndEmits() public {
        uint256 amount = 500e6;
        uint256 expPlatform = (amount * PLATFORM_BPS) / 10_000;
        uint256 expMerchant = (amount * MERCHANT_BPS) / 10_000;
        uint256 expTreasury = amount - expPlatform - expMerchant;

        vm.prank(payer);
        gate.deposit(merchant, "ACC-12345", address(usdc), amount);

        assertEq(usdc.balanceOf(platformRecv), expPlatform);
        assertEq(usdc.balanceOf(feeReceiver), expMerchant);
        assertEq(usdc.balanceOf(treasury), expTreasury);
        assertEq(gate.merchantDepositCount(merchant), 1);
    }

    function test_deposit_isReusable() public {
        vm.prank(payer);
        gate.deposit(merchant, "ACC-1", address(usdc), 100e6);
        vm.prank(payer);
        gate.deposit(merchant, "ACC-1", address(usdc), 200e6);
        assertEq(gate.merchantDepositCount(merchant), 2);
    }

    function test_dailyLimit_disabledByDefault() public {
        // setUp registered the merchant with limit = 0
        vm.prank(payer);
        gate.pay(_id("big"), merchant, address(usdc), 1_000_000e6);
    }

    function test_dailyLimit_revertsAboveLimit_usdc() public {
        // $1500/day cap.
        vm.prank(merchant);
        gate.setMerchantDailyLimit(1_500_000_000); // $1500 in 6dp

        vm.prank(payer);
        gate.pay(_id("a"), merchant, address(usdc), 1_000e6); // $1000

        // Adds $600 → would-be $1600 > $1500 cap.
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.DailyLimitExceeded.selector, 1_500_000_000, 1_600_000_000));
        gate.pay(_id("b"), merchant, address(usdc), 600e6);
    }

    function test_dailyLimit_isPerPayerMerchant_acrossTokens() public {
        // $1000/day cap.
        vm.prank(merchant);
        gate.setMerchantDailyLimit(1_000_000_000);

        // payer pays $600 USDC + $400 DAI → exactly $1000, OK.
        vm.prank(payer);
        gate.pay(_id("p1-usdc"), merchant, address(usdc), 600e6);
        vm.prank(payer);
        gate.pay(_id("p1-dai"), merchant, address(dai), 400e18);

        // Different payer is unaffected.
        vm.prank(payerB);
        gate.pay(_id("p2"), merchant, address(usdc), 1_000e6);

        // Same payer, different merchant is unaffected.
        address m2 = makeAddr("m2");
        vm.prank(m2);
        gate.registerMerchant(makeAddr("t2"), address(0), 0, 1_000_000_000);
        vm.prank(payer);
        gate.pay(_id("p1-m2"), m2, address(usdc), 1_000e6);

        // Original payer / merchant → tries another $1, would-be $1000 + $1 = over.
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.DailyLimitExceeded.selector, 1_000_000_000, 1_000_000_001));
        gate.pay(_id("p1-over"), merchant, address(usdc), 1);
    }

    function test_dailyLimit_priceFluctuation_reflectsInCap() public {
        // $100/day cap.
        vm.prank(merchant);
        gate.setMerchantDailyLimit(100_000_000); // $100

        // Spike DAI to $2 → 50 DAI now equals $100.
        daiFeed.setAnswer(2 * ONE_USD_8DP);
        vm.prank(payer);
        gate.pay(_id("dai-50"), merchant, address(dai), 50e18); // exactly $100

        // Same payer trying $1 USDC pushes over.
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.DailyLimitExceeded.selector, 100_000_000, 101_000_000));
        gate.pay(_id("over"), merchant, address(usdc), 1e6);
    }

    function test_dailyLimit_resetsNextDay() public {
        vm.prank(merchant);
        gate.setMerchantDailyLimit(500_000_000); // $500

        vm.prank(payer);
        gate.pay(_id("d1-fill"), merchant, address(usdc), 500e6);

        vm.warp(block.timestamp + 1 days + 1);
        // Refresh the oracle's `updatedAt` so it isn't stale after the warp —
        // the staleness check is independent of the day-rollover logic.
        usdcFeed.setAnswer(ONE_USD_8DP);

        vm.prank(payer);
        gate.pay(_id("d2-ok"), merchant, address(usdc), 500e6);
    }

    function test_dailyLimit_revertsIfNoFeedConfigured() public {
        // Remove the USDT feed; merchant's $1000 cap means USDT can't be paid.
        vm.prank(provider);
        gate.removeTokenPriceFeed(address(usdt));

        vm.prank(merchant);
        gate.setMerchantDailyLimit(1_000_000_000);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PriceFeedNotConfigured.selector, address(usdt)));
        gate.pay(_id("usdt-no-feed"), merchant, address(usdt), 1e6);

        // …but USDC (still has a feed) goes through.
        vm.prank(payer);
        gate.pay(_id("usdc-ok"), merchant, address(usdc), 1e6);
    }

    function test_dailyLimit_zeroSkipsFeedRequirement() public {
        // Merchant has limit=0, so a missing feed should not block payment.
        vm.prank(provider);
        gate.removeTokenPriceFeed(address(usdt));

        usdt.mint(payer, 100e6);
        vm.prank(payer);
        gate.pay(_id("nofeed-but-uncapped"), merchant, address(usdt), 50e6);
    }

    function test_dailyLimit_revertsOnStaleFeed() public {
        vm.prank(merchant);
        gate.setMerchantDailyLimit(1_000_000_000);

        // Push the feed timestamp backwards beyond the 1-hour staleness window.
        // Use a base "now" that's safely past STALE_AFTER + a buffer to avoid
        // underflow if the test starts at block.timestamp = 1.
        vm.warp(2 hours);
        usdcFeed.setUpdatedAt(block.timestamp - (1 hours + 1));

        vm.prank(payer);
        vm.expectRevert(
            abi.encodeWithSelector(Secudigate.StalePrice.selector, address(usdc), block.timestamp - (1 hours + 1))
        );
        gate.pay(_id("stale"), merchant, address(usdc), 100e6);
    }

    function test_dailyLimit_revertsOnNonPositiveAnswer() public {
        vm.prank(merchant);
        gate.setMerchantDailyLimit(1_000_000_000);
        usdcFeed.setAnswer(0);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.InvalidPrice.selector, int256(0)));
        gate.pay(_id("bad-price"), merchant, address(usdc), 100e6);
    }

    function test_setTokenPriceFeed_onlyAdmin() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, merchant, ADMIN)
        );
        gate.setTokenPriceFeed(address(usdc), address(usdcFeed));
    }

    function test_setTokenPriceFeed_revertsOnZeroToken() public {
        vm.prank(provider);
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        gate.setTokenPriceFeed(address(0), address(usdcFeed));
    }

    function test_setTokenPriceFeed_revertsOnZeroFeed() public {
        vm.prank(provider);
        vm.expectRevert(Secudigate.ZeroAddress.selector);
        gate.setTokenPriceFeed(address(usdc), address(0));
    }

    function test_setTokenPriceFeed_cachesDecimals() public {
        (, uint8 td, uint8 fd) = gate.priceFeeds(address(usdc));
        assertEq(td, 6);
        assertEq(fd, 8);
        (, uint8 ddTok, uint8 ddFeed) = gate.priceFeeds(address(dai));
        assertEq(ddTok, 18);
        assertEq(ddFeed, 8);
    }

    function test_removeTokenPriceFeed_clearsRegistry() public {
        vm.prank(provider);
        gate.removeTokenPriceFeed(address(usdc));
        (AggregatorV3Interface feed,,) = gate.priceFeeds(address(usdc));
        assertEq(address(feed), address(0));
    }

    function test_quoteUsd6_handlesDecimalsCorrectly() public view {
        // 25 USDC at $1.00 → $25.00 in 6dp.
        assertEq(gate.quoteUsd6(address(usdc), 25e6), 25_000_000);
        // 25 DAI at $1.00 → $25.00.
        assertEq(gate.quoteUsd6(address(dai), 25e18), 25_000_000);
    }

    function test_quoteUsd6_revertsForUnknownToken() public {
        address randomToken = makeAddr("unknown");
        vm.expectRevert(abi.encodeWithSelector(Secudigate.PriceFeedNotConfigured.selector, randomToken));
        gate.quoteUsd6(randomToken, 1);
    }

    function test_paidUsd6Today_accumulatesAcrossTokens() public {
        vm.prank(merchant);
        gate.setMerchantDailyLimit(10_000_000_000); // $10k cap, just to enable accumulation

        vm.prank(payer);
        gate.pay(_id("a"), merchant, address(usdc), 50e6);
        vm.prank(payer);
        gate.pay(_id("b"), merchant, address(dai), 10e18);

        assertEq(gate.paidUsd6Today(payer, merchant), 60_000_000); // $60
    }

    function test_quote_returnsCorrectSplit() public view {
        (uint256 p, uint256 m, uint256 net) = gate.quote(merchant, 10_000e6);
        assertEq(p, 100e6, "platform 1%");
        assertEq(m, 250e6, "merchant 2.5%");
        assertEq(net, 9_650e6);
    }

    function test_quote_unregisteredMerchant_skipsMerchantFee() public {
        (uint256 p, uint256 m, uint256 net) = gate.quote(makeAddr("none"), 10_000e6);
        assertEq(p, 100e6);
        assertEq(m, 0);
        assertEq(net, 9_900e6);
    }

    function test_aggregateTracking_incrementsVolumeAndCounts() public {
        vm.prank(payer);
        gate.pay(_id("a"), merchant, address(usdc), 1_000e6);
        vm.prank(payer);
        gate.deposit(merchant, "ref", address(usdc), 500e6);

        uint256 netPay = 1_000e6 - 10e6 - 25e6;
        uint256 netDep = 500e6 - 5e6 - 12_500_000;
        assertEq(gate.merchantVolume(merchant, address(usdc)), netPay + netDep);
        assertEq(gate.merchantPaymentCount(merchant), 1);
        assertEq(gate.merchantDepositCount(merchant), 1);
    }

    function test_sanctionsList_disabledByDefault() public {
        // No oracle wired in setUp → payments go through.
        vm.prank(payer);
        gate.pay(_id("clean"), merchant, address(usdc), 1e6);
    }

    function test_setSanctionsList_onlyAdmin() public {
        bytes32 ADMIN = gate.ADMIN_ROLE();
        MockSanctionsList list = new MockSanctionsList();
        vm.prank(merchant);
        vm.expectRevert(
            abi.encodeWithSelector(IAccessControl.AccessControlUnauthorizedAccount.selector, merchant, ADMIN)
        );
        gate.setSanctionsList(address(list));
    }

    function test_sanctionedPayer_isBlocked() public {
        MockSanctionsList list = new MockSanctionsList();
        list.setSanctioned(payer, true);
        vm.prank(provider);
        gate.setSanctionsList(address(list));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("ofac-payer"), merchant, address(usdc), 1e6);

        // A clean payer still goes through.
        vm.prank(payerB);
        gate.pay(_id("clean"), merchant, address(usdc), 1e6);
    }

    function test_sanctionedMerchant_isBlocked() public {
        MockSanctionsList list = new MockSanctionsList();
        list.setSanctioned(merchant, true);
        vm.prank(provider);
        gate.setSanctionsList(address(list));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, merchant));
        gate.pay(_id("ofac-merch"), merchant, address(usdc), 1e6);
    }

    function test_sanctionsList_blocksDepositToo() public {
        MockSanctionsList list = new MockSanctionsList();
        list.setSanctioned(payer, true);
        vm.prank(provider);
        gate.setSanctionsList(address(list));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.deposit(merchant, "ACC-1", address(usdc), 1e6);
    }

    function test_sanctionsList_canBeDisabledAgain() public {
        MockSanctionsList list = new MockSanctionsList();
        list.setSanctioned(payer, true);

        vm.prank(provider);
        gate.setSanctionsList(address(list));
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("blocked"), merchant, address(usdc), 1e6);

        // Clearing the oracle removes the screen.
        vm.prank(provider);
        gate.setSanctionsList(address(0));
        vm.prank(payer);
        gate.pay(_id("after-clear"), merchant, address(usdc), 1e6);
    }

    function test_reentrancyOnPay_isBlocked() public {
        ReentrantToken bad = new ReentrantToken();
        bad.transfer(payer, 1_000e18);
        vm.prank(payer);
        bad.approve(address(gate), type(uint256).max);

        vm.prank(merchant);
        gate.setMerchantFee(feeReceiver, 0); // simplify

        bad.arm(gate, _id("re-2"), merchant, 100e18);

        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("re-1"), merchant, address(bad), 100e18);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
