// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IChainalysisSanctionsList} from "../interfaces/IChainalysisSanctionsList.sol";

/// @notice Test/Sepolia stand-in for the Chainalysis sanctions oracle.
///         Real deployments should point Secudigate at the real oracle
///         (0x40C57923924B5c5c5455c48D93317139ADDaC8fb on mainnet).
contract MockSanctionsList is IChainalysisSanctionsList {
    mapping(address => bool) private _sanctioned;

    /// @notice Toggle whether `addr` is reported as sanctioned. Open access
    ///         on purpose — this contract is mock infrastructure used in
    ///         tests + the Sepolia demo.
    function setSanctioned(address addr, bool sanctioned) external {
        _sanctioned[addr] = sanctioned;
    }

    function isSanctioned(address addr) external view override returns (bool) {
        return _sanctioned[addr];
    }
}
