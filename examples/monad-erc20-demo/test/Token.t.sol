// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Token} from "../src/Token.sol";

contract TokenTest {
    function testMintUpdatesBalanceAndSupply() external {
        Token token = new Token();
        token.mint(address(this), 1000);

        require(token.balanceOf(address(this)) == 1000, "balance not minted");
        require(token.totalSupply() == 1000, "supply not minted");
    }

    function testTransferMovesBalance() external {
        Token token = new Token();
        address recipient = address(0xBEEF);
        token.mint(address(this), 1000);

        require(token.transfer(recipient, 250), "transfer failed");
        require(token.balanceOf(address(this)) == 750, "sender balance wrong");
        require(token.balanceOf(recipient) == 250, "recipient balance wrong");
    }
}
