// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Deliberately simple application surface used by the runtime demo.
/// Monad-specific failures are supplied by the runtime evidence suite, not by
/// pretending that a local EVM can reproduce every Monad condition.
contract RuntimeDemoVulnerable {
    mapping(address => uint256) public balanceOf;
    mapping(address => uint256) public fundedAtBlock;
    uint256 public highestBid;
    address public highestBidder;
    bool public settled;
    uint256 public purchases;

    function fund(address account, uint256 amount) external {
        balanceOf[account] += amount;
        fundedAtBlock[account] = block.number;
    }

    function purchase(uint256 price) public virtual {
        require(balanceOf[msg.sender] >= price, "insufficient balance");
        balanceOf[msg.sender] -= price;
        purchases += 1;
    }

    function placeBid(uint256 amount) external {
        require(amount > highestBid, "bid too low");
        highestBid = amount;
        highestBidder = msg.sender;
    }

    function releaseProduct() external {
        settled = true;
    }
}
