// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";
import {AccessControl} from "@openzeppelin-contracts/access/AccessControl.sol";
import {Pausable} from "@openzeppelin-contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin-contracts/utils/ReentrancyGuard.sol";
import {SafeERC20} from "@openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";
import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin-contracts/token/ERC20/extensions/IERC20Metadata.sol";

import {AggregatorV3Interface} from "./interfaces/AggregatorV3Interface.sol";
import {IChainalysisSanctionsList} from "./interfaces/IChainalysisSanctionsList.sol";

/// @title Secudigate — multi-tenant stablecoin payment gateway.
/// @notice One deployment per chain. Merchants self-register; payments
///         auto-forward in a single transaction with no contract custody.
///         Two payment modes share the same fee + routing logic:
///         - `pay`: single-use invoice, replay-protected.
///         - `deposit`: reusable open-amount link tagged with a paymentRef.
///
///         Per-payer daily caps are denominated in **USD with 6 decimals**
///         and converted on-chain via Chainlink price feeds. Admins set a
///         price feed per accepted token; payments in a token without a
///         configured feed are allowed only if the merchant's cap is 0.
contract Secudigate is Ownable, AccessControl, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // The contract has two distinct concepts:
    //   1. `owner` (Ownable) — single transferable principal. The owner manages
    //      the admin set: only the owner can `addAdmin`/`removeAdmin`. The
    //      owner is automatically granted ADMIN_ROLE on construction and on
    //      `transferOwnership`; renouncing ownership revokes it.
    //   2. `ADMIN_ROLE` (AccessControl) — the role gating platform admin
    //      actions: setting the platform fee receiver, setting the platform
    //      fee, pausing the gateway, and managing token price feeds. Multiple
    //      addresses can hold it.
    //
    // DEFAULT_ADMIN_ROLE is intentionally never granted, so role membership is
    // managed exclusively through the owner-only addAdmin/removeAdmin wrappers.
    //
    // Neither owner nor admins can edit any merchant's config. Merchants gate
    // themselves by msg.sender against the `merchants` mapping.

    /// @notice Role gating platform admin actions.
    bytes32 public constant ADMIN_ROLE = keccak256("ADMIN_ROLE");

    uint16 public constant BPS = 10_000;
    /// @notice Hard cap on the platform fee. Cannot be raised.
    uint16 public constant MAX_PLATFORM_FEE_BPS = 200; // 2.00%
    /// @notice Hard cap on each merchant's optional fee on their own customers.
    uint16 public constant MAX_MERCHANT_FEE_BPS = 1000; // 10.00%

    /// @notice Fixed precision for the daily-limit's USD denomination.
    ///         A `dailyLimitUsd6` of 25_000_000 means $25 / payer / day.
    uint8 public constant LIMIT_DECIMALS = 6;
    uint256 internal constant LIMIT_PRECISION = 10 ** uint256(LIMIT_DECIMALS);

    /// @notice Chainlink answers older than this are treated as stale and
    ///         cause `pay` / `deposit` to revert when a daily cap is active.
    uint256 public constant STALE_AFTER = 1 hours;

    /// @notice Address that receives the platform fee on every payment.
    address public secudigate;
    /// @notice Platform fee, in basis points. <= MAX_PLATFORM_FEE_BPS.
    uint16 public secudigateFeeBps;

    struct MerchantConfig {
        address treasury; // where the net (post-fee) amount goes
        address feeReceiver; // where the merchant's optional fee goes
        uint16 feeBps; // merchant's fee in BPS (0 = disabled)
        uint256 dailyLimitUsd6; // per-payer USD cap (6 decimals); 0 = disabled
        bool registered;
        bool paused;
    }

    /// @notice Merchant configurations keyed by the merchant's wallet address.
    mapping(address merchant => MerchantConfig) public merchants;

    struct TokenPriceConfig {
        AggregatorV3Interface feed;
        uint8 tokenDec;
        uint8 feedDec; // Chainlink USD feeds are 8 decimals
    }

    /// @notice Chainlink aggregator + cached decimals per accepted token.
    ///         Set by admins via `setTokenPriceFeed`. Tokens without a feed
    ///         can still be used for payments — but only by merchants with
    ///         no daily-USD cap, since the cap can't be evaluated in USD.
    mapping(address token => TokenPriceConfig) public priceFeeds;

    /// @notice Optional Chainalysis sanctions oracle. When set, every payer +
    ///         merchant address is screened on each `pay`/`deposit` call and
    ///         the tx reverts if either is on the OFAC SDN list. Set to the
    ///         zero address to disable (e.g. on local Anvil); on Sepolia
    ///         we point to a `MockSanctionsList`; on mainnet, the real
    ///         Chainalysis address (0x40C57923924B5c5c5455c48D93317139ADDaC8fb).
    IChainalysisSanctionsList public sanctionsList;

    /// @notice True once an invoice ID has been paid. Prevents double-pay.
    mapping(bytes32 invoiceId => bool) public paidInvoices;

    /// @dev Cumulative USD-6dp paid by `payer` to `merchant` on `dayIndex`,
    ///      where `dayIndex = block.timestamp / 1 days`. The accumulator is
    ///      token-agnostic on purpose: a merchant's "$25/day per payer"
    ///      cap should clamp the payer's total spend across USDC, USDT,
    ///      DAI, etc., not separately per token.
    mapping(address payer => mapping(address merchant => mapping(uint256 dayIndex => uint256 spentUsd6))) public
        payerDailyUsd;

    /// @notice Cumulative net amount routed to a merchant, by token. Excludes fees.
    mapping(address merchant => mapping(address token => uint256 total)) public merchantVolume;
    /// @notice Total invoice payments received by a merchant.
    mapping(address merchant => uint256) public merchantPaymentCount;
    /// @notice Total deposits received by a merchant.
    mapping(address merchant => uint256) public merchantDepositCount;

    event MerchantRegistered(
        address indexed merchant, address treasury, address feeReceiver, uint16 feeBps, uint256 dailyLimitUsd6
    );
    event MerchantTreasuryUpdated(address indexed merchant, address treasury);
    event MerchantFeeUpdated(address indexed merchant, address feeReceiver, uint16 feeBps);
    event MerchantDailyLimitUpdated(address indexed merchant, uint256 dailyLimitUsd6);
    event MerchantPausedSet(address indexed merchant, bool paused);

    event PlatformReceiverUpdated(address secudigate);
    event PlatformFeeUpdated(uint16 feeBps);

    event TokenPriceFeedSet(address indexed token, address feed, uint8 tokenDecimals, uint8 feedDecimals);
    event TokenPriceFeedRemoved(address indexed token);

    event SanctionsListUpdated(address oracle);

    event PaymentReceived(
        bytes32 indexed invoiceId,
        address indexed merchant,
        address indexed payer,
        address token,
        uint256 grossAmount,
        uint256 platformFee,
        uint256 merchantFee,
        uint256 netToTreasury
    );

    event DepositReceived(
        address indexed merchant,
        address indexed payer,
        address token,
        string paymentRef,
        uint256 grossAmount,
        uint256 platformFee,
        uint256 merchantFee,
        uint256 netToTreasury
    );

    error ZeroAddress();
    error ZeroAmount();
    error MerchantNotRegistered();
    error MerchantPausedError();
    error InvoiceAlreadyPaid();
    error PlatformFeeTooHigh(uint16 max);
    error MerchantFeeTooHigh(uint16 max);
    error DailyLimitExceeded(uint256 limitUsd6, uint256 wouldBeTotalUsd6);
    error CallerNotMerchant();
    error FeeReceiverRequired();
    error PriceFeedNotConfigured(address token);
    error StalePrice(address token, uint256 updatedAt);
    error InvalidPrice(int256 answer);
    error SanctionedAddress(address account);

    /// @param owner_            Initial owner (platform operator).
    /// @param secudigate_       Initial platform fee receiver.
    /// @param secudigateFeeBps_ Initial platform fee in BPS (<= MAX_PLATFORM_FEE_BPS).
    constructor(address owner_, address secudigate_, uint16 secudigateFeeBps_) Ownable(owner_) {
        if (secudigate_ == address(0)) revert ZeroAddress();
        if (secudigateFeeBps_ > MAX_PLATFORM_FEE_BPS) revert PlatformFeeTooHigh(MAX_PLATFORM_FEE_BPS);

        // DEFAULT_ADMIN_ROLE is never granted; only the owner manages admins.
        _grantRole(ADMIN_ROLE, owner_);

        secudigate = secudigate_;
        secudigateFeeBps = secudigateFeeBps_;

        emit PlatformReceiverUpdated(secudigate_);
        emit PlatformFeeUpdated(secudigateFeeBps_);
    }

    /// @notice Grant ADMIN_ROLE to `account`. Owner only.
    function addAdmin(address account) external onlyOwner {
        if (account == address(0)) revert ZeroAddress();
        _grantRole(ADMIN_ROLE, account);
    }

    /// @notice Revoke ADMIN_ROLE from `account`. Owner only.
    function removeAdmin(address account) external onlyOwner {
        _revokeRole(ADMIN_ROLE, account);
    }

    /// @notice Convenience view; equivalent to `hasRole(ADMIN_ROLE, account)`.
    function isAdmin(address account) external view returns (bool) {
        return hasRole(ADMIN_ROLE, account);
    }

    /// @notice Transfer ownership AND move ADMIN_ROLE from old owner to new
    ///         owner in one tx. Other admins are unaffected.
    function transferOwnership(address newOwner) public override onlyOwner {
        if (newOwner == address(0)) revert OwnableInvalidOwner(address(0));
        address oldOwner = owner();
        _transferOwnership(newOwner);
        _revokeRole(ADMIN_ROLE, oldOwner);
        _grantRole(ADMIN_ROLE, newOwner);
    }

    /// @notice Renounce ownership AND revoke ADMIN_ROLE from the renouncing
    ///         owner. Other admins (if any) keep their access.
    function renounceOwnership() public override onlyOwner {
        address oldOwner = owner();
        _transferOwnership(address(0));
        _revokeRole(ADMIN_ROLE, oldOwner);
    }

    /// @notice Update the platform fee receiver. Admin only.
    function setSecudigate(address newReceiver) external onlyRole(ADMIN_ROLE) {
        if (newReceiver == address(0)) revert ZeroAddress();
        secudigate = newReceiver;
        emit PlatformReceiverUpdated(newReceiver);
    }

    /// @notice Update the platform fee. Admin only. Capped at MAX_PLATFORM_FEE_BPS.
    function setSecudigateFeeBps(uint16 newBps) external onlyRole(ADMIN_ROLE) {
        if (newBps > MAX_PLATFORM_FEE_BPS) revert PlatformFeeTooHigh(MAX_PLATFORM_FEE_BPS);
        secudigateFeeBps = newBps;
        emit PlatformFeeUpdated(newBps);
    }

    /// @notice Pause the entire gateway. Admin only.
    function pause() external onlyRole(ADMIN_ROLE) {
        _pause();
    }

    /// @notice Unpause the entire gateway. Admin only.
    function unpause() external onlyRole(ADMIN_ROLE) {
        _unpause();
    }

    /// @notice Register or replace the Chainlink USD price feed for `token`.
    ///         Admin-only. Caches the token's and the feed's decimals so the
    ///         hot path (`_route`) doesn't need extra external calls.
    function setTokenPriceFeed(address token, address feed) external onlyRole(ADMIN_ROLE) {
        if (token == address(0) || feed == address(0)) revert ZeroAddress();
        uint8 tDec = IERC20Metadata(token).decimals();
        uint8 fDec = AggregatorV3Interface(feed).decimals();
        priceFeeds[token] = TokenPriceConfig({feed: AggregatorV3Interface(feed), tokenDec: tDec, feedDec: fDec});
        emit TokenPriceFeedSet(token, feed, tDec, fDec);
    }

    /// @notice Remove the price feed mapping for `token`. Admin only.
    ///         Tokens without a feed remain payable but cannot be used by
    ///         merchants who have an active daily USD cap.
    function removeTokenPriceFeed(address token) external onlyRole(ADMIN_ROLE) {
        delete priceFeeds[token];
        emit TokenPriceFeedRemoved(token);
    }

    /// @notice Set or clear the Chainalysis sanctions oracle. Pass the zero
    ///         address to disable screening (useful on local dev / Anvil).
    ///         Admin only.
    function setSanctionsList(address oracle) external onlyRole(ADMIN_ROLE) {
        sanctionsList = IChainalysisSanctionsList(oracle);
        emit SanctionsListUpdated(oracle);
    }

    // Merchant config (only the merchant can edit their own slot).

    /// @notice Self-register or fully overwrite this caller's merchant config.
    /// @dev `feeReceiver` may be zero only when `feeBps == 0`.
    /// @param dailyLimitUsd6 Per-payer USD cap with 6 decimals. 0 = disabled.
    function registerMerchant(address treasury, address feeReceiver, uint16 feeBps, uint256 dailyLimitUsd6)
        external
        whenNotPaused
    {
        _validateMerchantFee(feeBps, feeReceiver);
        if (treasury == address(0)) revert ZeroAddress();

        MerchantConfig storage c = merchants[msg.sender];
        c.treasury = treasury;
        c.feeReceiver = feeReceiver;
        c.feeBps = feeBps;
        c.dailyLimitUsd6 = dailyLimitUsd6;
        c.registered = true;
        // c.paused is preserved across re-registration.

        emit MerchantRegistered(msg.sender, treasury, feeReceiver, feeBps, dailyLimitUsd6);
    }

    function setMerchantTreasury(address newTreasury) external {
        _requireMerchant();
        if (newTreasury == address(0)) revert ZeroAddress();
        merchants[msg.sender].treasury = newTreasury;
        emit MerchantTreasuryUpdated(msg.sender, newTreasury);
    }

    function setMerchantFee(address newFeeReceiver, uint16 newFeeBps) external {
        _requireMerchant();
        _validateMerchantFee(newFeeBps, newFeeReceiver);
        merchants[msg.sender].feeReceiver = newFeeReceiver;
        merchants[msg.sender].feeBps = newFeeBps;
        emit MerchantFeeUpdated(msg.sender, newFeeReceiver, newFeeBps);
    }

    /// @notice Update this merchant's per-payer daily USD cap (6 decimals).
    function setMerchantDailyLimit(uint256 newLimitUsd6) external {
        _requireMerchant();
        merchants[msg.sender].dailyLimitUsd6 = newLimitUsd6;
        emit MerchantDailyLimitUpdated(msg.sender, newLimitUsd6);
    }

    /// @notice Pause / unpause this merchant's gateway. Independent from global pause.
    function setMerchantPaused(bool isPaused) external {
        _requireMerchant();
        merchants[msg.sender].paused = isPaused;
        emit MerchantPausedSet(msg.sender, isPaused);
    }

    /// @notice Pay a single-use invoice. The (invoiceId) tuple is consumed; further
    ///         calls with the same `invoiceId` revert with `InvoiceAlreadyPaid`.
    /// @dev Amount enforcement vs. invoice expectation is off-chain — the event
    ///      emits the actual gross amount paid, and the backend reconciles.
    function pay(bytes32 invoiceId, address merchant, address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        if (paidInvoices[invoiceId]) revert InvoiceAlreadyPaid();
        paidInvoices[invoiceId] = true;

        (uint256 platformFee, uint256 merchantFee, uint256 netToTreasury) = _route(merchant, token, amount);

        unchecked {
            merchantPaymentCount[merchant] += 1;
        }

        emit PaymentReceived(invoiceId, merchant, msg.sender, token, amount, platformFee, merchantFee, netToTreasury);
    }

    /// @notice Pay an open-amount deposit link. Reusable; tagged with a free-form
    ///         off-chain paymentRef (account number, user id, etc.).
    function deposit(address merchant, string calldata paymentRef, address token, uint256 amount)
        external
        nonReentrant
        whenNotPaused
    {
        (uint256 platformFee, uint256 merchantFee, uint256 netToTreasury) = _route(merchant, token, amount);

        unchecked {
            merchantDepositCount[merchant] += 1;
        }

        emit DepositReceived(merchant, msg.sender, token, paymentRef, amount, platformFee, merchantFee, netToTreasury);
    }

    /// @notice Compute the fee split + net for a given (merchant, amount).
    ///         Useful for the UI to show what the merchant will actually receive.
    /// @dev Returns zero merchantFee when the merchant is unregistered.
    function quote(address merchant, uint256 amount)
        external
        view
        returns (uint256 platformFee, uint256 merchantFee, uint256 netToTreasury)
    {
        platformFee = (amount * secudigateFeeBps) / BPS;
        MerchantConfig storage c = merchants[merchant];
        merchantFee = c.registered ? (amount * c.feeBps) / BPS : 0;
        netToTreasury = amount - platformFee - merchantFee;
    }

    /// @notice Convert `amount` of `token` to USD with 6 decimals using the
    ///         configured Chainlink feed. Reverts if no feed is set or if
    ///         the feed answer is stale or non-positive.
    function quoteUsd6(address token, uint256 amount) external view returns (uint256) {
        return _toUsd6(token, amount);
    }

    /// @notice Cumulative USD-6dp paid by `payer` to `merchant` today.
    function paidUsd6Today(address payer, address merchant) external view returns (uint256) {
        return payerDailyUsd[payer][merchant][block.timestamp / 1 days];
    }

    function _route(address merchant, address token, uint256 amount)
        internal
        returns (uint256 platformFee, uint256 merchantFee, uint256 netToTreasury)
    {
        if (amount == 0) revert ZeroAmount();
        if (token == address(0)) revert ZeroAddress();

        // Screen payer and merchant. We don't screen treasury/feeReceiver
        // because the merchant vouched for those at registration time.
        IChainalysisSanctionsList _list = sanctionsList;
        if (address(_list) != address(0)) {
            if (_list.isSanctioned(msg.sender)) revert SanctionedAddress(msg.sender);
            if (_list.isSanctioned(merchant)) revert SanctionedAddress(merchant);
        }

        MerchantConfig storage c = merchants[merchant];
        if (!c.registered) revert MerchantNotRegistered();
        if (c.paused) revert MerchantPausedError();

        if (c.dailyLimitUsd6 > 0) {
            uint256 spentUsd6 = _toUsd6(token, amount); // reverts if no feed / stale
            uint256 day = block.timestamp / 1 days;
            uint256 priorTotal = payerDailyUsd[msg.sender][merchant][day];
            uint256 newTotal = priorTotal + spentUsd6;
            if (newTotal > c.dailyLimitUsd6) revert DailyLimitExceeded(c.dailyLimitUsd6, newTotal);
            payerDailyUsd[msg.sender][merchant][day] = newTotal;
        }

        platformFee = (amount * secudigateFeeBps) / BPS;
        merchantFee = (amount * c.feeBps) / BPS;
        netToTreasury = amount - platformFee - merchantFee;

        // Effects before interactions (CEI).
        merchantVolume[merchant][token] += netToTreasury;

        // Three direct payer→recipient transfers; no contract custody.
        IERC20 t = IERC20(token);
        if (platformFee > 0) {
            t.safeTransferFrom(msg.sender, secudigate, platformFee);
        }
        if (merchantFee > 0) {
            t.safeTransferFrom(msg.sender, c.feeReceiver, merchantFee);
        }
        if (netToTreasury > 0) {
            t.safeTransferFrom(msg.sender, c.treasury, netToTreasury);
        }
    }

    /// @dev Convert `amount` of `token` to USD with `LIMIT_DECIMALS` precision.
    ///      Reverts if no feed, if the answer is non-positive, or if the
    ///      feed has not been updated within `STALE_AFTER`.
    function _toUsd6(address token, uint256 amount) internal view returns (uint256) {
        TokenPriceConfig storage cfg = priceFeeds[token];
        if (address(cfg.feed) == address(0)) revert PriceFeedNotConfigured(token);

        (, int256 answer,, uint256 updatedAt,) = cfg.feed.latestRoundData();
        if (answer <= 0) revert InvalidPrice(answer);
        if (block.timestamp > updatedAt + STALE_AFTER) revert StalePrice(token, updatedAt);

        // usd6 = amount * answer * 1e6 / (10^tokenDec * 10^feedDec)
        // For a 6-dec token at $1.00 with an 8-dec feed:
        //   amount=25e6, answer=1e8 → 25e6 * 1e8 * 1e6 / (1e6 * 1e8) = 25e6 ✓
        // For an 18-dec token at $1.00:
        //   amount=25e18, answer=1e8 → 25e18 * 1e8 * 1e6 / (1e18 * 1e8) = 25e6 ✓
        return (amount * uint256(answer) * LIMIT_PRECISION) / (10 ** uint256(cfg.tokenDec) * 10 ** uint256(cfg.feedDec));
    }

    function _requireMerchant() internal view {
        if (!merchants[msg.sender].registered) revert CallerNotMerchant();
    }

    function _validateMerchantFee(uint16 feeBps, address feeReceiver) internal pure {
        if (feeBps > MAX_MERCHANT_FEE_BPS) revert MerchantFeeTooHigh(MAX_MERCHANT_FEE_BPS);
        if (feeBps > 0 && feeReceiver == address(0)) revert FeeReceiverRequired();
    }
}
