// SPDX-License-Identifier: MIT
pragma solidity ^0.8.26;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Strings.sol";

/// @title HoodCards
/// @notice Set 1 "Sherwood" collector cards. Every card is a normal ERC-721 in
///         the holder's own wallet: transferable from the moment it mints, with
///         no custody and no approval gate on the HoodPacks side.
/// @dev    Only the sale contract may mint. `cardOf` records which of the 24
///         Set 1 faces a token id carries, so metadata is derived, not stored.
contract HoodCards is ERC721Enumerable, Ownable {
    using Strings for uint256;

    /// @notice Contract permitted to mint. Set once by the owner after deploy.
    address public minter;

    /// @notice tokenId => card id (1..24, indexes the Set 1 roster)
    mapping(uint256 => uint16) public cardOf;

    uint256 public nextTokenId = 1;

    string private _base;

    event Minted(address indexed to, uint256 indexed tokenId, uint16 indexed cardId);
    event MinterSet(address indexed minter);

    error NotMinter();

    constructor(string memory baseURI_, address owner_)
        ERC721("Hood Cards", "HOODCARD")
        Ownable(owner_)
    {
        _base = baseURI_;
    }

    modifier onlyMinter() {
        if (msg.sender != minter) revert NotMinter();
        _;
    }

    function setMinter(address minter_) external onlyOwner {
        minter = minter_;
        emit MinterSet(minter_);
    }

    function setBaseURI(string calldata baseURI_) external onlyOwner {
        _base = baseURI_;
    }

    /// @notice Mint one card. Callable only by the sale contract.
    function mint(address to, uint16 cardId) external onlyMinter returns (uint256 tokenId) {
        tokenId = nextTokenId++;
        cardOf[tokenId] = cardId;
        _safeMint(to, tokenId);
        emit Minted(to, tokenId, cardId);
    }

    /// @dev Metadata is keyed by card id, so every copy of a card shares a face.
    function tokenURI(uint256 tokenId) public view override returns (string memory) {
        _requireOwned(tokenId);
        return string.concat(_base, uint256(cardOf[tokenId]).toString(), ".json");
    }
}
