// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RuntimeDemoVulnerable} from "./RuntimeDemoVulnerable.sol";

/// @notice Fixed counterpart used to pair the same journeys with safe evidence.
contract RuntimeDemoFixed is RuntimeDemoVulnerable {
    uint256 public constant REQUIRED_FUNDING_DISTANCE = 3;

    function purchase(uint256 price) public override {
        require(block.number >= fundedAtBlock[msg.sender] + REQUIRED_FUNDING_DISTANCE, "funding not settled");
        super.purchase(price);
    }
}
