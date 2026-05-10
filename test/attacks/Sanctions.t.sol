// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Secudigate} from "../../src/Secudigate.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {MockSanctionsList} from "../../src/mocks/MockSanctionsList.sol";
import {IChainalysisSanctionsList} from "../../src/interfaces/IChainalysisSanctionsList.sol";
import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";

/// @notice Sanctions oracle adversarial cases.
///
/// _route() screens both payer (msg.sender) and merchant against an
/// optional Chainalysis-shaped oracle. Treasury / feeReceiver / the
/// platform fee receiver are NOT screened — that's documented design.
///
/// These tests probe the boundaries:
///   - sanctioned payer / merchant on pay AND deposit
///   - what is intentionally NOT screened (treasury, feeReceiver, secudigate)
///   - hostile oracle that reverts or always returns true
///   - toggle sanctioned mid-flow (prior payments stay, future blocked)
///   - disabled oracle (address(0)) skips screening entirely
///   - screening runs before merchant registration check
///
/// Together with [test_sanctionsList_*] in the main suite, this covers
/// the full sanctions surface.

contract Mock6 is ERC20 {
    constructor() ERC20("Mock", "MK") {
        _mint(msg.sender, 1_000_000e6);
    }

    function decimals() public pure override returns (uint8) {
        return 6;
    }
}

/// Reverts on every isSanctioned call.
contract RevertingSanctionsList is IChainalysisSanctionsList {
    function isSanctioned(address) external pure override returns (bool) {
        revert("sanctions: down");
    }
}

/// Sanctions everyone. An admin pointing at this rugs the gateway —
/// documented as the operator's responsibility to pick a real oracle.
contract DenyAllSanctionsList is IChainalysisSanctionsList {
    function isSanctioned(address) external pure override returns (bool) {
        return true;
    }
}

/// Consumes most of the forwarded gas. A pathological oracle could
/// brick the gateway via gas griefing — but only if an admin sets it.
contract GasGriefSanctionsList is IChainalysisSanctionsList {
    function isSanctioned(address) external view override returns (bool) {
        uint256 i;
        while (gasleft() > 50_000) {
            i++;
        }
        return false;
    }
}

contract SanctionsAttacks is Test {
    Secudigate gate;
    Mock6 mock;
    MockAggregator feed;
    MockSanctionsList list;

    address provider = makeAddr("provider");
    address platformRecv = makeAddr("platformRecv");
    address merchant = makeAddr("merchant");
    address treasury = makeAddr("treasury");
    address feeReceiver = makeAddr("feeReceiver");
    address payer = makeAddr("payer");
    address attacker = makeAddr("attacker");

    function setUp() public {
        gate = new Secudigate(provider, platformRecv, 100); // 1%
        mock = new Mock6();
        feed = new MockAggregator(8, 1e8, "MK / USD");
        list = new MockSanctionsList();

        vm.prank(provider);
        gate.setTokenPriceFeed(address(mock), address(feed));
        vm.prank(provider);
        gate.setSanctionsList(address(list));

        vm.prank(merchant);
        gate.registerMerchant(treasury, feeReceiver, 250, 0); // 2.5%

        mock.transfer(payer, 100_000e6);
        vm.prank(payer);
        mock.approve(address(gate), type(uint256).max);
    }

    function test_sanctionedPayer_blocksDeposit() public {
        list.setSanctioned(payer, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.deposit(merchant, "ref", address(mock), 100e6);
    }

    function test_sanctionedMerchant_blocksDeposit() public {
        list.setSanctioned(merchant, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, merchant));
        gate.deposit(merchant, "ref", address(mock), 100e6);
    }

    function test_sanctionsCheck_runsBeforeMerchantLookup() public {
        // A sanctioned payer trying to pay to an UNREGISTERED merchant
        // gets the SanctionedAddress error, not MerchantNotRegistered.
        // Confirms screening is the first gate in _route — a sanctioned
        // address can't even probe registration state.
        list.setSanctioned(payer, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("probe"), makeAddr("ghost"), address(mock), 1e6);
    }

    function test_sanctionedTreasury_isNotScreened_documentedDesign() public {
        // The merchant attached a sanctioned treasury at registration.
        // Gateway doesn't second-guess that — merchant's responsibility.
        // This documents the design choice in the contract comment at
        // _route():
        //   "an adversarial merchant attaching a sanctioned wallet to
        //    themselves is the merchant's problem, not the gateway's."
        address sanctionedTreasury = makeAddr("sanctionedTreasury");
        list.setSanctioned(sanctionedTreasury, true);

        address solo = makeAddr("soloMerchant");
        vm.prank(solo);
        gate.registerMerchant(sanctionedTreasury, address(0), 0, 0);

        vm.prank(payer);
        gate.pay(_id("not-screened"), solo, address(mock), 100e6);
        assertEq(mock.balanceOf(sanctionedTreasury), 99e6, "treasury funded despite sanction");
    }

    function test_sanctionedFeeReceiver_isNotScreened() public {
        // Same shape but for the merchant fee receiver. Not screened.
        list.setSanctioned(feeReceiver, true);
        vm.prank(payer);
        gate.pay(_id("fr-not-screened"), merchant, address(mock), 100e6);
        assertGt(mock.balanceOf(feeReceiver), 0, "fee receiver funded despite sanction");
    }

    function test_sanctionedPlatformReceiver_isNotScreened() public {
        // The platform fee receiver is the admin's pick. Not screened —
        // admin's job to avoid pointing it at a sanctioned address.
        list.setSanctioned(platformRecv, true);
        vm.prank(payer);
        gate.pay(_id("pr-not-screened"), merchant, address(mock), 100e6);
        assertEq(mock.balanceOf(platformRecv), 1e6, "platform receiver funded despite sanction");
    }

    function test_revertingOracle_blocksAllPayments() public {
        // A sanctions oracle that reverts on every call bricks the
        // gateway. Documented: admin must point at a working oracle or
        // address(0) to disable.
        RevertingSanctionsList bad = new RevertingSanctionsList();
        vm.prank(provider);
        gate.setSanctionsList(address(bad));

        vm.prank(payer);
        vm.expectRevert(); // "sanctions: down" bubbles up
        gate.pay(_id("rev-oracle"), merchant, address(mock), 1e6);
    }

    function test_denyAllOracle_blocksAllPayments() public {
        // Same shape via a different mechanism — every address is
        // reported as sanctioned. Whole gateway is rugged.
        DenyAllSanctionsList bad = new DenyAllSanctionsList();
        vm.prank(provider);
        gate.setSanctionsList(address(bad));

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("deny-all"), merchant, address(mock), 1e6);
    }

    function test_gasGriefOracle_eatsGasButCanComplete() public {
        // Documents that a gas-griefing oracle is still admin-fixable
        // by setting it back to address(0) or a sane oracle. We don't
        // test the actual gas consumption (the test runner has effectively
        // unbounded gas) — just that admin can recover.
        GasGriefSanctionsList bad = new GasGriefSanctionsList();
        vm.prank(provider);
        gate.setSanctionsList(address(bad));

        // Recovery: admin disables the oracle.
        vm.prank(provider);
        gate.setSanctionsList(address(0));
        vm.prank(payer);
        gate.pay(_id("recovered"), merchant, address(mock), 1e6);
    }

    function test_payer_sanctionedAfterPriorPayment_priorIsKept() public {
        // Existing balances aren't clawed back when a payer gets later
        // sanctioned — only future payments are blocked.
        vm.prank(payer);
        gate.pay(_id("before"), merchant, address(mock), 100e6);

        uint256 treasuryBalBefore = mock.balanceOf(treasury);
        list.setSanctioned(payer, true);

        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("after"), merchant, address(mock), 100e6);

        assertEq(mock.balanceOf(treasury), treasuryBalBefore, "prior payment preserved");
    }

    function test_payer_unsanctioned_canResume() public {
        list.setSanctioned(payer, true);
        vm.prank(payer);
        vm.expectRevert(abi.encodeWithSelector(Secudigate.SanctionedAddress.selector, payer));
        gate.pay(_id("blocked"), merchant, address(mock), 1e6);

        list.setSanctioned(payer, false);
        vm.prank(payer);
        gate.pay(_id("unblocked"), merchant, address(mock), 1e6);
    }

    function test_disabledOracle_skipsScreening() public {
        // After setSanctionsList(address(0)), no screening happens — even
        // an address that WAS sanctioned can transact.
        list.setSanctioned(payer, true);
        vm.prank(provider);
        gate.setSanctionsList(address(0));

        vm.prank(payer);
        gate.pay(_id("disabled"), merchant, address(mock), 1e6);
    }

    function _id(string memory s) internal pure returns (bytes32) {
        return keccak256(bytes(s));
    }
}
