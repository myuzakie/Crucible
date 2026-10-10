// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {CertificateRegistry} from "../src/CertificateRegistry.sol";

contract CertificateRegistryTest {
    CertificateRegistry private registry;
    bytes32 private constant HASH = keccak256("certificate");

    function setUp() public {
        registry = new CertificateRegistry();
    }

    function testRegisterStoresIssuerAndUri() public {
        registry.register(HASH, "ipfs://crucible/certificate");
        (address issuer, uint64 timestamp, string memory uri, bool exists) = registry.get(HASH);
        require(issuer == address(this), "issuer");
        require(timestamp > 0, "timestamp");
        require(keccak256(bytes(uri)) == keccak256(bytes("ipfs://crucible/certificate")), "uri");
        require(exists, "exists");
    }

    function testCannotRegisterSameHashTwice() public {
        registry.register(HASH, "first");
        (bool ok,) = address(registry).call(
            abi.encodeWithSelector(registry.register.selector, HASH, "second")
        );
        require(!ok, "duplicate accepted");
    }

    function testCannotRegisterEmptyHash() public {
        (bool ok,) = address(registry).call(
            abi.encodeWithSelector(registry.register.selector, bytes32(0), "empty")
        );
        require(!ok, "empty hash accepted");
    }
}
