// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

contract Collectible {
    string public name = "Crucible Collectible";
    string public symbol = "CRC";
    uint256 private nextTokenId;
    mapping(uint256 => address) private owners;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);

    function mint(address to) external returns (uint256 tokenId) {
        require(to != address(0), "zero recipient");
        tokenId = nextTokenId++;
        owners[tokenId] = to;
        emit Transfer(address(0), to, tokenId);
    }

    function ownerOf(uint256 tokenId) external view returns (address) {
        address owner = owners[tokenId];
        require(owner != address(0), "nonexistent token");
        return owner;
    }
}
