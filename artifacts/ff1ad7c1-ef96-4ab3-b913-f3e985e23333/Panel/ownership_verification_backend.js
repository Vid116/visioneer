// Backend Ownership Verification System for LED Board NFT Tiles
// Implements secure blockchain-based ownership verification with middleware

require('dotenv').config();
const express = require('express');
const ethers = require('ethers');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const helmet = require('helmet');
const cors = require('cors');
const crypto = require('crypto');

class OwnershipVerificationService {
    constructor(config) {
        this.app = express();
        this.config = config;
        this.provider = new ethers.JsonRpcProvider(config.ethereumRpcUrl);
        this.contract = new ethers.Contract(
            config.contractAddress,
            config.contractAbi,
            this.provider
        );
        
        // In-memory cache for ownership data (consider Redis for production)
        this.ownershipCache = new Map();
        this.cacheTimeout = 60000; // 1 minute
        
        // Nonce storage to prevent replay attacks
        this.usedNonces = new Set();
        
        this.setupMiddleware();
        this.setupRoutes();
    }

    setupMiddleware() {
        // Security middleware
        this.app.use(helmet());
        this.app.use(cors({
            origin: ['http://localhost:3000', 'http://localhost:3001'],
            credentials: true
        }));
        this.app.use(express.json({ limit: '10mb' }));

        // Rate limiting to prevent abuse
        const limiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
            message: 'Too many requests from this IP'
        });
        this.app.use('/api/', limiter);

        // Authentication middleware
        this.app.use('/api/protected', this.authenticateToken.bind(this));
    }

    setupRoutes() {
        // Public routes
        this.app.post('/api/auth/verify', this.verifyWalletSignature.bind(this));
        this.app.get('/api/tiles/:tileId/owner', this.getTileOwner.bind(this));
        this.app.get('/api/status', this.getSystemStatus.bind(this));

        // Protected routes (require authentication)
        this.app.post('/api/protected/tile/color', this.updateTileColor.bind(this));
        this.app.post('/api/protected/tiles/batch-update', this.batchUpdateTiles.bind(this));
        this.app.get('/api/protected/user/tiles', this.getUserTiles.bind(this));
        
        // Ownership verification middleware for tile operations
        this.app.use('/api/protected/tile*', this.verifyTileOwnership.bind(this));
    }

    // Generate secure nonce for signature verification
    generateNonce() {
        return crypto.randomBytes(32).toString('hex');
    }

    // Verify wallet signature and issue JWT
    async verifyWalletSignature(req, res) {
        try {
            const { address, signature, message, nonce } = req.body;

            // Validate required fields
            if (!address || !signature || !message || !nonce) {
                return res.status(400).json({
                    success: false,
                    error: 'Missing required fields: address, signature, message, nonce'
                });
            }

            // Check if nonce was already used (prevent replay attacks)
            if (this.usedNonces.has(nonce)) {
                return res.status(400).json({
                    success: false,
                    error: 'Nonce already used'
                });
            }

            // Verify the signature
            const recoveredAddress = ethers.verifyMessage(message, signature);
            
            if (recoveredAddress.toLowerCase() !== address.toLowerCase()) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid signature'
                });
            }

            // Mark nonce as used
            this.usedNonces.add(nonce);
            
            // Clean old nonces periodically (keep only last hour)
            if (this.usedNonces.size > 10000) {
                this.usedNonces.clear();
            }

            // Generate JWT token
            const token = jwt.sign(
                { 
                    address: address.toLowerCase(),
                    timestamp: Date.now()
                },
                this.config.jwtSecret,
                { expiresIn: '24h' }
            );

            // Get user's tiles for initial load
            const userTiles = await this.getUserTilesByAddress(address);

            res.json({
                success: true,
                token,
                address: address.toLowerCase(),
                tiles: userTiles,
                expiresIn: 24 * 60 * 60 * 1000 // 24 hours in milliseconds
            });

        } catch (error) {
            console.error('Signature verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Internal server error during verification'
            });
        }
    }

    // JWT authentication middleware
    authenticateToken(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Access token required'
            });
        }

        jwt.verify(token, this.config.jwtSecret, (err, decoded) => {
            if (err) {
                return res.status(403).json({
                    success: false,
                    error: 'Invalid or expired token'
                });
            }

            req.userAddress = decoded.address;
            next();
        });
    }

    // Ownership verification middleware for tile operations
    async verifyTileOwnership(req, res, next) {
        try {
            const { tileId, x, y } = req.body;
            let targetTileId = tileId;

            // Convert x,y coordinates to tileId if needed
            if (!targetTileId && x !== undefined && y !== undefined) {
                targetTileId = this.coordinatesToTileId(x, y);
            }

            if (targetTileId === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Tile ID or coordinates required'
                });
            }

            // Verify ownership
            const owner = await this.getTileOwnerFromContract(targetTileId);
            
            if (owner.toLowerCase() !== req.userAddress) {
                return res.status(403).json({
                    success: false,
                    error: 'You do not own this tile',
                    tileId: targetTileId,
                    owner,
                    requestedBy: req.userAddress
                });
            }

            req.tileId = targetTileId;
            next();

        } catch (error) {
            console.error('Ownership verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Error verifying tile ownership'
            });
        }
    }

    // Get tile owner from smart contract with caching
    async getTileOwnerFromContract(tileId) {
        const cacheKey = `owner_${tileId}`;
        const cached = this.ownershipCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
            return cached.owner;
        }

        try {
            const owner = await this.contract.ownerOf(tileId);
            
            // Cache the result
            this.ownershipCache.set(cacheKey, {
                owner: owner.toLowerCase(),
                timestamp: Date.now()
            });

            return owner.toLowerCase();
        } catch (error) {
            console.error(`Error getting owner for tile ${tileId}:`, error);
            throw error;
        }
    }

    // Get all tiles owned by a specific address
    async getUserTilesByAddress(address) {
        try {
            const balance = await this.contract.balanceOf(address);
            const tiles = [];

            for (let i = 0; i < balance; i++) {
                const tileId = await this.contract.tokenOfOwnerByIndex(address, i);
                const tileIdNum = Number(tileId);
                const position = this.tileIdToCoordinates(tileIdNum);
                tiles.push({
                    tileId: tileIdNum,
                    x: position.x,
                    y: position.y
                });
            }

            return tiles;
        } catch (error) {
            console.error('Error fetching user tiles:', error);
            return [];
        }
    }

    // Convert tile coordinates to tileId (8x8 grid: 0-63)
    coordinatesToTileId(x, y) {
        if (x < 0 || x > 7 || y < 0 || y > 7) {
            throw new Error('Invalid coordinates: must be 0-7');
        }
        return y * 8 + x;
    }

    // Convert tileId to coordinates
    tileIdToCoordinates(tileId) {
        if (tileId < 0 || tileId > 63) {
            throw new Error('Invalid tileId: must be 0-63');
        }
        return {
            x: tileId % 8,
            y: Math.floor(tileId / 8)
        };
    }

    // API Route Handlers
    async getTileOwner(req, res) {
        try {
            const { tileId } = req.params;
            const owner = await this.getTileOwnerFromContract(parseInt(tileId));
            
            res.json({
                success: true,
                tileId: parseInt(tileId),
                owner,
                coordinates: this.tileIdToCoordinates(parseInt(tileId))
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error fetching tile owner'
            });
        }
    }

    async getUserTiles(req, res) {
        try {
            const tiles = await this.getUserTilesByAddress(req.userAddress);
            res.json({
                success: true,
                address: req.userAddress,
                tiles,
                count: tiles.length
            });
        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error fetching user tiles'
            });
        }
    }

    async updateTileColor(req, res) {
        try {
            const { x, y, r, g, b, tileId } = req.body;

            // Validate color values
            if (r < 0 || r > 255 || g < 0 || g > 255 || b < 0 || b > 255) {
                return res.status(400).json({
                    success: false,
                    error: 'Color values must be between 0-255'
                });
            }

            const targetTileId = tileId || req.tileId;
            const coordinates = this.tileIdToCoordinates(targetTileId);

            // Send color update to LED board hardware
            const updateResult = await this.sendColorToHardware({
                tileId: targetTileId,
                x: coordinates.x,
                y: coordinates.y,
                r, g, b
            });

            res.json({
                success: true,
                tileId: targetTileId,
                coordinates,
                color: { r, g, b },
                hardwareUpdate: updateResult
            });

        } catch (error) {
            console.error('Color update error:', error);
            res.status(500).json({
                success: false,
                error: 'Error updating tile color'
            });
        }
    }

    async batchUpdateTiles(req, res) {
        try {
            const { updates } = req.body;

            if (!Array.isArray(updates)) {
                return res.status(400).json({
                    success: false,
                    error: 'Updates must be an array'
                });
            }

            const results = [];
            const errors = [];

            for (const update of updates) {
                try {
                    const { tileId, x, y, r, g, b } = update;
                    const targetTileId = tileId || this.coordinatesToTileId(x, y);
                    
                    // Verify ownership for each tile
                    const owner = await this.getTileOwnerFromContract(targetTileId);
                    
                    if (owner.toLowerCase() !== req.userAddress) {
                        errors.push({
                            tileId: targetTileId,
                            error: 'Not owner of this tile'
                        });
                        continue;
                    }

                    // Update color
                    await this.sendColorToHardware({
                        tileId: targetTileId,
                        x: x || targetTileId % 8,
                        y: y || Math.floor(targetTileId / 8),
                        r, g, b
                    });

                    results.push({
                        tileId: targetTileId,
                        success: true
                    });

                } catch (error) {
                    errors.push({
                        tileId: update.tileId || 'unknown',
                        error: error.message
                    });
                }
            }

            res.json({
                success: errors.length === 0,
                processed: results.length,
                results,
                errors
            });

        } catch (error) {
            res.status(500).json({
                success: false,
                error: 'Error processing batch update'
            });
        }
    }

    // Send color update to hardware via ESP32 mock server
    async sendColorToHardware(colorData) {
        const axios = require('axios');
        const ESP32_URL = process.env.ESP32_URL || 'http://localhost:3001';

        try {
            const response = await axios.post(`${ESP32_URL}/api/tile/color`, {
                x: colorData.x,
                y: colorData.y,
                r: colorData.r,
                g: colorData.g,
                b: colorData.b
            });

            return {
                success: true,
                timestamp: Date.now(),
                hardware_response: response.data
            };
        } catch (error) {
            console.error('Hardware update failed:', error.message);
            return {
                success: false,
                timestamp: Date.now(),
                error: error.message
            };
        }
    }

    getSystemStatus(req, res) {
        res.json({
            success: true,
            status: 'online',
            timestamp: Date.now(),
            contract: this.config.contractAddress,
            network: this.provider.network?.name || 'unknown',
            cacheSize: this.ownershipCache.size
        });
    }

    // Start the server
    start(port = 3002) {
        this.app.listen(port, () => {
            console.log(`Ownership verification server running on port ${port}`);
        });
    }
}

// Configuration and initialization
const config = {
    ethereumRpcUrl: process.env.ETHEREUM_RPC_URL || 'https://eth-sepolia.g.alchemy.com/v2/5ezoaVMUahKLDPrs78wgi',
    contractAddress: process.env.CONTRACT_ADDRESS || '0xeE3474805Bc1A0Cdc13B1A758D1e35F057BA6AFD',
    contractAbi: [
        "function ownerOf(uint256 tokenId) view returns (address)",
        "function balanceOf(address owner) view returns (uint256)",
        "function tokenOfOwnerByIndex(address owner, uint256 index) view returns (uint256)",
        "function getTileOwner(uint256 x, uint256 y) view returns (address)",
        "function doesOwnTile(address owner, uint256 x, uint256 y) view returns (bool)",
        "function getTilesOwnedBy(address owner) view returns (uint256[])",
        "function getTilePosition(uint256 tokenId) view returns (uint256 x, uint256 y)"
    ],
    jwtSecret: process.env.JWT_SECRET || 'tile-nft-secret-key-change-in-production'
};

// Export for use
module.exports = OwnershipVerificationService;

// Example usage
if (require.main === module) {
    const service = new OwnershipVerificationService(config);
    service.start();
}