// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AggregatorV3Interface} from "../interfaces/AggregatorV3Interface.sol";

/// @notice Tiny Chainlink-compatible price oracle for tests + Sepolia demos.
///         Real deployments should set the gateway's price feed to the
///         official Chainlink aggregator for that token. This mock lets
///         the demo enforce USD-denominated caps without relying on the
///         (sparse) Sepolia feed registry.
contract MockAggregator is AggregatorV3Interface {
    uint8 public override decimals;
    int256 public answer;
    uint256 public updatedAt;
    string public description;

    /// @param decimals_    Feed precision. Chainlink USD feeds typically use 8.
    /// @param initialPrice Initial answer in `decimals_`-precision USD.
    constructor(uint8 decimals_, int256 initialPrice, string memory description_) {
        decimals = decimals_;
        answer = initialPrice;
        updatedAt = block.timestamp;
        description = description_;
    }

    /// @notice Set a new price; refreshes `updatedAt`.
    function setAnswer(int256 newAnswer) external {
        answer = newAnswer;
        updatedAt = block.timestamp;
    }

    /// @notice Backdate the last update — used by tests to exercise the
    ///         gateway's staleness check.
    function setUpdatedAt(uint256 t) external {
        updatedAt = t;
    }

    function latestRoundData() external view override returns (uint80, int256, uint256, uint256, uint80) {
        return (1, answer, updatedAt, updatedAt, 1);
    }
}
