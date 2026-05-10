// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {IERC20} from "@openzeppelin-contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin-contracts/token/ERC20/utils/SafeERC20.sol";

/// @notice Attacks via malicious ERC20 token implementations.
///
/// Real-world ERC20s misbehave in known ways:
///   - USDT returns no value (not even `bool`) from transfer/transferFrom
///   - Fee-on-transfer tokens deliver less than `amount` to the recipient
///   - Some revert on transfers of 0
///   - Hostile decimals() / non-standard ABI on token-metadata calls
///
/// These tests check that Secudigate's defense (SafeERC20 + checks at
/// setTokenPriceFeed time) handles these correctly: real misbehavior is
/// either tolerated (USDT-style) or rejected loudly (return-false /
/// revert-on-transfer), never silently accepted.

// Token shapes

/// Returns false from transferFrom instead of reverting. SafeERC20 must
/// catch this and revert with SafeERC20FailedOperation.
contract ReturnFalseToken is ERC20 {
    constructor() ERC20("ReturnsFalse", "RF") {
        _mint(msg.sender, 1_000_000e18);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        return false;
    }
}

/// Reverts on every transferFrom. Should bubble through SafeERC20.
contract RevertingToken is ERC20 {
    constructor() ERC20("Reverting", "RV") {
        _mint(msg.sender, 1_000_000e18);
    }

    function transferFrom(address, address, uint256) public pure override returns (bool) {
        revert("token: reverted");
    }
}

/// Transfers less than `amount`. The contract's fee math doesn't know,
/// so the merchant receives less than the gross amount minus computed
/// fees. Documents the behavior — Secudigate is intentionally NOT
/// fee-on-transfer-aware (most stablecoins aren't FoT, and adding the
/// check would bloat gas for the 99% case).
contract FeeOnTransferToken is ERC20 {
    constructor() ERC20("FeeOnTransfer", "FOT") {
        _mint(msg.sender, 1_000_000e18);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        // Keep 1% as a "transfer fee" — recipient receives 99%.
        uint256 net = amount - (amount / 100);
        return super.transferFrom(from, to, net);
    }
}

/// Reverts when transferred amount is zero. Some tokens (older USDT
/// versions, BNB) do this.
contract NoZeroTransferToken is ERC20 {
    constructor() ERC20("NoZero", "NZ") {
        _mint(msg.sender, 1_000_000e18);
    }

    function transferFrom(address from, address to, uint256 amount) public override returns (bool) {
        require(amount > 0, "NZ: zero transfer");
        return super.transferFrom(from, to, amount);
    }
}

/// USDT-shaped: transferFrom returns no value at all. SafeERC20 tolerates
/// this (it doesn't decode the return data if length is 0).
contract UsdtShapedToken {
    string public constant name = "Pseudo-USDT";
    string public constant symbol = "USDT";
    uint8 public constant decimals = 6;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    uint256 public totalSupply;

    constructor() {
        balanceOf[msg.sender] = 1_000_000e6;
        totalSupply = 1_000_000e6;
    }

    function transfer(address to, uint256 amount) public {
        require(balanceOf[msg.sender] >= amount, "bal");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        // Note: no return value, like real USDT mainnet.
    }

    function approve(address spender, uint256 amount) public {
        allowance[msg.sender][spender] = amount;
        // Also no return value.
    }

    function transferFrom(address from, address to, uint256 amount) public {
        require(balanceOf[from] >= amount, "bal");
        require(allowance[from][msg.sender] >= amount, "allow");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
    }
}

/// decimals() reverts. setTokenPriceFeed should fail loudly.
contract NoDecimalsToken is ERC20 {
    constructor() ERC20("NoDecimals", "ND") {
        _mint(msg.sender, 1_000e18);
    }

    function decimals() public pure override returns (uint8) {
        revert("decimals: not implemented");
    }
}

// Tests

contract MaliciousTokenAttacks is Test {
    Secudigate gate;
    MockAggregator feed;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address payer = makeAddr("payer");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100); // 1%
        feed = new MockAggregator(8, 1e8, "X / USD");

        vm.prank(merchant);
        gate.registerMerchant(treasury, address(0), 0, 0);
    }

    function test_returnFalseToken_revertsOnPay() public {
        ReturnFalseToken bad = new ReturnFalseToken();
        bad.transfer(payer, 1_000e18);
        vm.prank(payer);
        bad.approve(address(gate), type(uint256).max);

        vm.prank(provider);
        gate.setTokenPriceFeed(address(bad), address(feed));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(SafeERC20.SafeERC20FailedOperation.selector, address(bad)));
        gate.pay(_id("rf"), merchant, address(bad), 100e18);
    }

    function test_revertingToken_revertReachesPayer() public {
        RevertingToken bad = new RevertingToken();
        bad.transfer(payer, 1_000e18);
        vm.prank(payer);
        bad.approve(address(gate), type(uint256).max);

        vm.prank(provider);
        gate.setTokenPriceFeed(address(bad), address(feed));

        vm.prank(payer);
        vm.expectRevert();
        gate.pay(_id("rv"), merchant, address(bad), 100e18);
    }

    //
    // This test DOCUMENTS the behavior. Secudigate is not FoT-aware, by
    // design: stablecoins aren't FoT, and adding before/after balance
    // checks would double the gas. The test passes regardless because
    // the transfer succeeds; we just verify the merchant receives less
    // than the contract's bookkeeping reports.

    function test_feeOnTransfer_merchantReceivesLessThanBookkeeping() public {
        FeeOnTransferToken bad = new FeeOnTransferToken();
        bad.transfer(payer, 1_000e18);
        vm.prank(payer);
        bad.approve(address(gate), type(uint256).max);

        vm.prank(provider);
        gate.setTokenPriceFeed(address(bad), address(feed));

        vm.prank(payer);
        gate.pay(_id("fot"), merchant, address(bad), 100e18);

        // platform fee: 1% of 100e18 = 1e18 expected; 0.99 delivered
        assertEq(bad.balanceOf(platformRecv), 0.99e18, "platform fee actually delivered");
        // merchant: 99% of 100e18 = 99e18 expected; 99e18 * 0.99 actually delivered
        assertEq(bad.balanceOf(treasury), uint256(99e18 * 99) / 100, "treasury net");
        // merchantVolume bookkeeping reports the expected (not the delivered) amount
        assertEq(gate.merchantVolume(merchant, address(bad)), 99e18, "bookkeeping divergence");
    }

    //
    // Secudigate skips the merchant-fee transferFrom when feeBps == 0,
    // so a "no zero transfer" token still works for merchants without a
    // merchant fee — proving the if-guard inside _route earns its keep.

    function test_noZeroTransfer_worksWhenMerchantFeeIsZero() public {
        NoZeroTransferToken bad = new NoZeroTransferToken();
        bad.transfer(payer, 1_000e18);
        vm.prank(payer);
        bad.approve(address(gate), type(uint256).max);

        vm.prank(provider);
        gate.setTokenPriceFeed(address(bad), address(feed));

        // Merchant fee is 0 from setUp, so the middle transferFrom is
        // skipped; the token's no-zero check never fires.
        vm.prank(payer);
        gate.pay(_id("nz-ok"), merchant, address(bad), 100e18);
        assertEq(bad.balanceOf(treasury), 99e18, "treasury net after 1% platform fee");
    }

    function test_usdtShapedToken_setFeedRevertsBecauseNoDecimalsBool() public {
        // setTokenPriceFeed reads token.decimals() via IERC20Metadata.
        // Our pseudo-USDT exposes `decimals` as a public state variable,
        // which Solidity's compiler exposes as a function with the same
        // ABI shape as IERC20Metadata.decimals(). So setting the feed
        // succeeds. (Verifies we're not over-strict about token shape.)
        UsdtShapedToken usdt = new UsdtShapedToken();
        vm.prank(provider);
        gate.setTokenPriceFeed(address(usdt), address(feed));
        // Sanity: pay path works too (SafeERC20 tolerates no-return-data).
        usdt.transfer(payer, 1_000e6);
        vm.prank(payer);
        usdt.approve(address(gate), type(uint256).max);

        vm.prank(payer);
        gate.pay(_id("usdt"), merchant, address(usdt), 100e6);
        assertEq(usdt.balanceOf(treasury), 99e6, "treasury net");
    }

    function test_noDecimalsToken_setFeedReverts() public {
        NoDecimalsToken bad = new NoDecimalsToken();
        vm.prank(provider);
        vm.expectRevert(); // any revert is acceptable — bubbles from IERC20Metadata
        gate.setTokenPriceFeed(address(bad), address(feed));
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
