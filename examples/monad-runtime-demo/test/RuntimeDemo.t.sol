// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {RuntimeDemoFixed} from "../src/RuntimeDemoFixed.sol";
import {RuntimeDemoVulnerable} from "../src/RuntimeDemoVulnerable.sol";

contract RuntimeDemoTest {
    function testVulnerableApplicationSupportsTheGenericJourneys() external {
        RuntimeDemoVulnerable demo = new RuntimeDemoVulnerable();
        demo.fund(address(this), 100);
        demo.purchase(40);
        demo.placeBid(10);
        demo.releaseProduct();

        require(demo.purchases() == 1, "purchase did not pass");
        require(demo.highestBid() == 10, "bid did not pass");
        require(demo.settled(), "settlement did not pass");
    }

    function testFixedApplicationKeepsTheSameSurface() external {
        RuntimeDemoFixed demo = new RuntimeDemoFixed();
        require(demo.REQUIRED_FUNDING_DISTANCE() == 3, "safe distance missing");
        demo.placeBid(10);
        demo.releaseProduct();
        require(demo.highestBid() == 10, "bid did not pass");
        require(demo.settled(), "settlement did not pass");
    }
}
