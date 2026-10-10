// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract CertificateRegistry {
    struct Record {
        address issuer;
        uint64 timestamp;
        string uri;
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
            exists: true
        });
        emit CertificateRegistered(contentHash, msg.sender, uri);
    }

    function get(bytes32 contentHash) external view returns (Record memory) {
        return records[contentHash];
    }
}
