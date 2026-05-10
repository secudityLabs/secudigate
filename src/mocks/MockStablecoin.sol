// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin-contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin-contracts/access/Ownable.sol";

/// @title MockStablecoin
/// @notice Testnet ERC20 with configurable name/symbol/decimals and an open
///         faucet so anyone can grab a fixed drip for paying invoices.
///         Strictly for testnet demos — do NOT deploy on a chain where users
///         could mistake it for a real stablecoin.
contract MockStablecoin is ERC20, Ownable {
    uint8 private immutable _decimals;

    /// @notice Amount minted per `faucet()` call (in token units, i.e. already
    ///         scaled by 10**decimals).
    uint256 public immutable faucetAmount;

    error FaucetCooldown(uint256 nextEligibleAt);

    /// @notice Optional cooldown between successive faucet drips per address.
    ///         Zero disables the limit. Defaults to 0.
    uint256 public immutable faucetCooldown;

    /// @notice Last faucet drip timestamp per recipient. Zero if never claimed.
    mapping(address recipient => uint256 timestamp) public lastClaimedAt;

    event FaucetDrip(address indexed recipient, uint256 amount);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 faucetAmount_,
        uint256 faucetCooldown_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        faucetAmount = faucetAmount_;
        faucetCooldown = faucetCooldown_;
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    /// @notice Mint the standard drip to the caller. Open to anyone, subject
    ///         to the optional `faucetCooldown` per address.
    function faucet() external {
        if (faucetCooldown > 0) {
            uint256 lastAt = lastClaimedAt[msg.sender];
            if (lastAt != 0 && block.timestamp < lastAt + faucetCooldown) {
                revert FaucetCooldown(lastAt + faucetCooldown);
            }
        }
        lastClaimedAt[msg.sender] = block.timestamp;
        _mint(msg.sender, faucetAmount);
        emit FaucetDrip(msg.sender, faucetAmount);
    }

    /// @notice Owner-only ad-hoc mint, useful during testing setups.
    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
