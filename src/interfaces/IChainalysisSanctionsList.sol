// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Chainalysis on-chain sanctions oracle interface.
/// @dev    Real deployment lives at 0x40C57923924B5c5c5455c48D93317139ADDaC8fb on
///         Ethereum mainnet (and at the published per-chain addresses for L2s).
///         Documentation: https://go.chainalysis.com/chainalysis-oracle-docs.html
///
///         The oracle returns true when `addr` is on the OFAC SDN list (or
///         any sanctions list Chainalysis aggregates). It is free to call
///         (~5k gas), updated by Chainalysis off-chain, and is what most
///         decentralized front-ends + protocols use today.
interface IChainalysisSanctionsList {
    function isSanctioned(address addr) external view returns (bool);
}
