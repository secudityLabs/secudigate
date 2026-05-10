// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Minimal Chainlink data feed interface (subset of the public
///         AggregatorV3Interface). Vendored locally so the project doesn't
///         pull the full Chainlink contracts package — the gateway only
///         needs `decimals()` and `latestRoundData()`.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);

    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}
