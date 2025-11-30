// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

/**
 * @title TileNFT
 * @dev ERC-721 contract for LED grid tile ownership (8x8 = 64 tiles)
 * Each NFT represents ownership of one tile in the LED advertising board
 */
contract TileNFT is ERC721, ERC721URIStorage, ERC721Enumerable, Ownable {
    
    // Constants
    uint256 public constant MAX_TILES = 64; // 8x8 grid
    uint256 public constant GRID_SIZE = 8;
    
    // State variables
    uint256 private _currentTokenId = 0;
    string private _baseTokenURI;
    
    // Mapping from tokenId to grid coordinates
    mapping(uint256 => GridPosition) public tilePositions;
    
    // Mapping from coordinates to tokenId (for reverse lookup)
    mapping(uint256 => mapping(uint256 => uint256)) public coordinateToTokenId;
    
    struct GridPosition {
        uint256 x;
        uint256 y;
    }
    
    // Events
    event TileMinted(address indexed to, uint256 indexed tokenId, uint256 x, uint256 y);
    event BaseURIUpdated(string newBaseURI);
    
    constructor(
        string memory name,
        string memory symbol,
        string memory baseTokenURI,
        address initialOwner
    ) ERC721(name, symbol) Ownable(initialOwner) {
        _baseTokenURI = baseTokenURI;
        
        // Pre-mint all 64 tiles in constructor for fixed supply
        _batchMintAllTiles(initialOwner);
    }
    
    /**
     * @dev Batch mint all 64 tiles to initial owner in constructor
     * This creates a fixed supply of exactly 64 NFTs
     */
    function _batchMintAllTiles(address to) private {
        for (uint256 i = 0; i < MAX_TILES; i++) {
            uint256 tokenId = i;
            uint256 x = i % GRID_SIZE;
            uint256 y = i / GRID_SIZE;
            
            // Store position mapping
            tilePositions[tokenId] = GridPosition(x, y);
            coordinateToTokenId[x][y] = tokenId;
            
            // Mint the token
            _safeMint(to, tokenId);
            
            emit TileMinted(to, tokenId, x, y);
        }
        
        _currentTokenId = MAX_TILES;
    }
    
    /**
     * @dev Get tile position by token ID
     */
    function getTilePosition(uint256 tokenId) external view returns (uint256 x, uint256 y) {
        require(_ownerOf(tokenId) != address(0), "Token does not exist");
        GridPosition memory position = tilePositions[tokenId];
        return (position.x, position.y);
    }
    
    /**
     * @dev Get token ID by grid coordinates
     */
    function getTokenIdByCoordinates(uint256 x, uint256 y) external view returns (uint256) {
        require(x < GRID_SIZE && y < GRID_SIZE, "Coordinates out of bounds");
        return coordinateToTokenId[x][y];
    }
    
    /**
     * @dev Get all tiles owned by an address
     */
    function getTilesOwnedBy(address owner) external view returns (uint256[] memory) {
        uint256 balance = balanceOf(owner);
        uint256[] memory ownedTokens = new uint256[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            ownedTokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        
        return ownedTokens;
    }
    
    /**
     * @dev Get grid positions for all tiles owned by an address
     */
    function getTilePositionsOwnedBy(address owner) external view returns (GridPosition[] memory) {
        uint256 balance = balanceOf(owner);
        GridPosition[] memory positions = new GridPosition[](balance);
        
        for (uint256 i = 0; i < balance; i++) {
            uint256 tokenId = tokenOfOwnerByIndex(owner, i);
            positions[i] = tilePositions[tokenId];
        }
        
        return positions;
    }
    
    /**
     * @dev Check if a specific tile is owned by an address
     */
    function doesOwnTile(address owner, uint256 x, uint256 y) external view returns (bool) {
        require(x < GRID_SIZE && y < GRID_SIZE, "Coordinates out of bounds");
        uint256 tokenId = coordinateToTokenId[x][y];
        return ownerOf(tokenId) == owner;
    }
    
    /**
     * @dev Get owner of a tile by coordinates
     */
    function getTileOwner(uint256 x, uint256 y) external view returns (address) {
        require(x < GRID_SIZE && y < GRID_SIZE, "Coordinates out of bounds");
        uint256 tokenId = coordinateToTokenId[x][y];
        return ownerOf(tokenId);
    }
    
    /**
     * @dev Update base URI (only owner)
     */
    function setBaseURI(string memory baseTokenURI) external onlyOwner {
        _baseTokenURI = baseTokenURI;
        emit BaseURIUpdated(baseTokenURI);
    }
    
    /**
     * @dev Override tokenURI to use base URI + token ID
     */
    function tokenURI(uint256 tokenId) 
        public 
        view 
        override(ERC721, ERC721URIStorage) 
        returns (string memory) 
    {
        require(_ownerOf(tokenId) != address(0), "URI query for nonexistent token");
        
        string memory baseURI = _baseURI();
        return bytes(baseURI).length > 0 
            ? string(abi.encodePacked(baseURI, Strings.toString(tokenId), ".json"))
            : "";
    }
    
    /**
     * @dev Override _baseURI to return stored base URI
     */
    function _baseURI() internal view override returns (string memory) {
        return _baseTokenURI;
    }
    
    // Required overrides for multiple inheritance
    function _update(address to, uint256 tokenId, address auth)
        internal
        override(ERC721, ERC721Enumerable)
        returns (address)
    {
        return super._update(to, tokenId, auth);
    }

    function _increaseBalance(address account, uint128 value)
        internal
        override(ERC721, ERC721Enumerable)
    {
        super._increaseBalance(account, value);
    }

    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, ERC721URIStorage, ERC721Enumerable)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
    
    /**
     * @dev Get total number of tiles (always 64)
     */
    function totalTiles() external pure returns (uint256) {
        return MAX_TILES;
    }
    
    /**
     * @dev Get grid size (always 8x8)
     */
    function gridSize() external pure returns (uint256) {
        return GRID_SIZE;
    }
}