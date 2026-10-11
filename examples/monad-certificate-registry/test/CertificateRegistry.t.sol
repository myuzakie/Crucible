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
        CertificateRegistry.Record memory record = registry.get(HASH);
        require(record.issuer == address(this), "issuer");
        require(record.timestamp > 0, "timestamp");
        require(keccak256(bytes(record.uri)) == keccak256(bytes("ipfs://crucible/certificate")), "uri");
        require(record.exists, "exists");
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

    function testRegisterPassportStoresSuiteVersion() public {
        bytes32 passportHash = keccak256("passport");
        registry.registerPassport(passportHash, "https://crucible.example/passport", "1.0.0");
        CertificateRegistry.Record memory record = registry.get(passportHash);
        require(keccak256(bytes(record.suiteVersion)) == keccak256(bytes("1.0.0")), "suite version");
        require(record.exists, "passport exists");
    }
}
