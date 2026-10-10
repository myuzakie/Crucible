// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {BuggyToken} from "../src/BuggyToken.sol";

contract BuggyTokenTest {
    function testBugIsObservable() external {
        BuggyToken token = new BuggyToken();
        token.mint(address(this), 1000);

        // This passing test documents the intentional failure used by Crucible.
        require(token.balanceOf(address(this)) == 0, "fixture bug was removed");
        require(token.totalSupply() == 0, "fixture supply bug was removed");
    }
}
