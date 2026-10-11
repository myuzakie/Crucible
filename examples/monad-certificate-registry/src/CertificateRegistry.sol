// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    struct Record {
        address issuer;
        uint64 timestamp;
        string uri;
        string suiteVersion;
        bool exists;
    }

    mapping(bytes32 => Record) private records;

    event CertificateRegistered(bytes32 indexed contentHash, address indexed issuer, string uri);

    function register(bytes32 contentHash, string calldata uri) external {
        require(contentHash != bytes32(0), "empty hash");
        require(!records[contentHash].exists, "already registered");
        records[contentHash] = Record({
            issuer: msg.sender,
            timestamp: uint64(block.timestamp),
            uri: uri,
            suiteVersion: "",
            exists: true
        });
        emit CertificateRegistered(contentHash, msg.sender, uri);
    }

    function registerPassport(bytes32 passportHash, string calldata uri, string calldata suiteVersion) external {
        require(passportHash != bytes32(0), "empty hash");
        require(!records[passportHash].exists, "already registered");
        records[passportHash] = Record({
            issuer: msg.sender,
            timestamp: uint64(block.timestamp),
            uri: uri,
            suiteVersion: suiteVersion,
            exists: true
        });
        emit CertificateRegistered(passportHash, msg.sender, uri);
    }

    function get(bytes32 contentHash) external view returns (Record memory) {
        return records[contentHash];
    }
}
