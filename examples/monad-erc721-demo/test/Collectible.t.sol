// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Collectible} from "../src/Collectible.sol";

contract CollectibleTest {
    Collectible private collectible;

    function setUp() public {
        collectible = new Collectible();
    }

    function testMintSetsOwner() public {
        collectible.mint(address(this));
        require(collectible.ownerOf(0) == address(this), "owner");
    }

    function testUnknownTokenReverts() public {
        (bool ok,) = address(collectible).call(abi.encodeWithSelector(collectible.ownerOf.selector, 999));
        require(!ok, "unknown token accepted");
    }
}
