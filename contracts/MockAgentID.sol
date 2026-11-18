// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/// @notice Test-only stand-in for the Agent ID ERC-721 (balanceOf surface only).
contract MockAgentID {
    mapping(address => uint256) private balances;

    function mint(address to) external {
        balances[to] += 1;
    }

    function balanceOf(address owner) external view returns (uint256) {
        return balances[owner];
    }
}
