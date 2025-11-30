// Advanced Authentication Middleware for NFT Ownership Verification
// Provides wallet signature verification, JWT handling, and ownership caching

const { ethers } = require('ethers');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');

class AuthenticationMiddleware {
    constructor(config) {
        this.config = config;
        this.provider = new ethers.providers.JsonRpcProvider(config.ethereumRpcUrl);
        this.contract = new ethers.Contract(
            config.contractAddress,
            config.contractAbi,
            this.provider
        );
        
        // Session and nonce management
        this.activeSessions = new Map();
        this.usedNonces = new Map();
        this.nonceExpiry = 5 * 60 * 1000; // 5 minutes
        
        // Ownership caching for performance
        this.ownershipCache = new Map();
        this.cacheExpiry = 60 * 1000; // 1 minute
        
        // Rate limiting per address
        this.rateLimitMap = new Map();
        this.rateLimitWindow = 15 * 60 * 1000; // 15 minutes
        this.rateLimitMax = 50; // requests per window
    }

    // Generate cryptographically secure nonce
    generateAuthNonce() {
        const nonce = crypto.randomBytes(32).toString('hex');
        const timestamp = Date.now();
        
        this.usedNonces.set(nonce, timestamp);
        
        // Clean expired nonces
        this.cleanupExpiredNonces();
        
        return nonce;
    }

    // Clean up expired nonces to prevent memory bloat
    cleanupExpiredNonces() {
        const now = Date.now();
        for (const [nonce, timestamp] of this.usedNonces.entries()) {
            if (now - timestamp > this.nonceExpiry) {
                this.usedNonces.delete(nonce);
            }
        }
    }

    // Wallet signature verification middleware
    async verifyWalletSignature(req, res, next) {
        try {
            const { address, signature, message, nonce } = req.body;

            // Input validation
            if (!this.validateAuthInputs(address, signature, message, nonce)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid authentication parameters'
                });
            }

            // Rate limiting check
            if (!this.checkRateLimit(address)) {
                return res.status(429).json({
                    success: false,
                    error: 'Rate limit exceeded. Try again later.'
                });
            }

            // Nonce validation
            if (!this.validateNonce(nonce)) {
                return res.status(400).json({
                    success: false,
                    error: 'Invalid or expired nonce'
                });
            }

            // Signature verification
            const isValidSignature = await this.verifySignature(address, signature, message);
            if (!isValidSignature) {
                return res.status(401).json({
                    success: false,
                    error: 'Invalid wallet signature'
                });
            }

            // Mark nonce as used
            this.markNonceAsUsed(nonce);

            // Attach verified address to request
            req.verifiedAddress = address.toLowerCase();
            req.authTimestamp = Date.now();

            next();

        } catch (error) {
            console.error('Signature verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Authentication server error'
            });
        }
    }

    // JWT token verification middleware
    verifyJWT(req, res, next) {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1];

        if (!token) {
            return res.status(401).json({
                success: false,
                error: 'Authentication token required',
                authRequired: true
            });
        }

        try {
            const decoded = jwt.verify(token, this.config.jwtSecret);
            
            // Check if token is still valid and not revoked
            if (!this.isSessionValid(decoded.address, decoded.sessionId)) {
                return res.status(403).json({
                    success: false,
                    error: 'Session expired or revoked',
                    authRequired: true
                });
            }

            req.userAddress = decoded.address;
            req.sessionId = decoded.sessionId;
            req.tokenIssued = decoded.iat;

            next();

        } catch (error) {
            console.error('JWT verification error:', error);
            res.status(403).json({
                success: false,
                error: 'Invalid authentication token',
                authRequired: true
            });
        }
    }

    // Ownership verification middleware for specific tiles
    async verifyTileOwnership(req, res, next) {
        try {
            const { tileId, x, y } = req.body;
            let targetTileId = tileId;

            // Convert coordinates to tileId if needed
            if (targetTileId === undefined && x !== undefined && y !== undefined) {
                targetTileId = this.coordinatesToTileId(x, y);
            }

            if (targetTileId === undefined) {
                return res.status(400).json({
                    success: false,
                    error: 'Tile identifier required (tileId or x,y coordinates)'
                });
            }

            // Get tile owner with caching
            const owner = await this.getTileOwnerCached(targetTileId);
            
            if (!owner || owner.toLowerCase() !== req.userAddress) {
                return res.status(403).json({
                    success: false,
                    error: 'Tile access denied',
                    details: {
                        tileId: targetTileId,
                        owner: owner || 'unknown',
                        requestedBy: req.userAddress,
                        message: owner ? 'You do not own this tile' : 'Tile ownership could not be verified'
                    }
                });
            }

            // Attach tile info to request
            req.verifiedTileId = targetTileId;
            req.tileOwner = owner.toLowerCase();
            req.tileCoordinates = this.tileIdToCoordinates(targetTileId);

            next();

        } catch (error) {
            console.error('Ownership verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Unable to verify tile ownership'
            });
        }
    }

    // Batch ownership verification for multiple tiles
    async verifyBatchOwnership(req, res, next) {
        try {
            const { tiles } = req.body;

            if (!Array.isArray(tiles) || tiles.length === 0) {
                return res.status(400).json({
                    success: false,
                    error: 'Tiles array required for batch operation'
                });
            }

            const verifiedTiles = [];
            const accessDenied = [];

            for (const tile of tiles) {
                const { tileId, x, y } = tile;
                let targetTileId = tileId || this.coordinatesToTileId(x, y);

                try {
                    const owner = await this.getTileOwnerCached(targetTileId);
                    
                    if (owner && owner.toLowerCase() === req.userAddress) {
                        verifiedTiles.push({
                            tileId: targetTileId,
                            coordinates: this.tileIdToCoordinates(targetTileId),
                            verified: true
                        });
                    } else {
                        accessDenied.push({
                            tileId: targetTileId,
                            owner: owner || 'unknown',
                            reason: owner ? 'not_owner' : 'ownership_unknown'
                        });
                    }
                } catch (error) {
                    accessDenied.push({
                        tileId: targetTileId,
                        error: error.message,
                        reason: 'verification_failed'
                    });
                }
            }

            if (accessDenied.length > 0) {
                return res.status(403).json({
                    success: false,
                    error: 'Batch ownership verification failed',
                    verified: verifiedTiles,
                    denied: accessDenied,
                    summary: {
                        total: tiles.length,
                        verified: verifiedTiles.length,
                        denied: accessDenied.length
                    }
                });
            }

            req.verifiedTiles = verifiedTiles;
            next();

        } catch (error) {
            console.error('Batch ownership verification error:', error);
            res.status(500).json({
                success: false,
                error: 'Batch ownership verification failed'
            });
        }
    }

    // Helper methods
    validateAuthInputs(address, signature, message, nonce) {
        return (
            address && 
            ethers.utils.isAddress(address) &&
            signature &&
            message &&
            nonce &&
            typeof nonce === 'string' &&
            nonce.length === 64 // 32 bytes hex
        );
    }

    checkRateLimit(address) {
        const now = Date.now();
        const key = address.toLowerCase();
        
        if (!this.rateLimitMap.has(key)) {
            this.rateLimitMap.set(key, { count: 1, windowStart: now });
            return true;
        }

        const rateData = this.rateLimitMap.get(key);
        
        // Reset window if expired
        if (now - rateData.windowStart > this.rateLimitWindow) {
            rateData.count = 1;
            rateData.windowStart = now;
            return true;
        }

        // Check if limit exceeded
        if (rateData.count >= this.rateLimitMax) {
            return false;
        }

        rateData.count++;
        return true;
    }

    validateNonce(nonce) {
        if (!this.usedNonces.has(nonce)) {
            return false;
        }

        const timestamp = this.usedNonces.get(nonce);
        return (Date.now() - timestamp) <= this.nonceExpiry;
    }

    markNonceAsUsed(nonce) {
        this.usedNonces.delete(nonce);
    }

    async verifySignature(address, signature, message) {
        try {
            const recoveredAddress = ethers.utils.verifyMessage(message, signature);
            return recoveredAddress.toLowerCase() === address.toLowerCase();
        } catch (error) {
            console.error('Signature verification failed:', error);
            return false;
        }
    }

    async getTileOwnerCached(tileId) {
        const cacheKey = `owner_${tileId}`;
        const cached = this.ownershipCache.get(cacheKey);

        if (cached && Date.now() - cached.timestamp < this.cacheExpiry) {
            return cached.owner;
        }

        try {
            const owner = await this.contract.ownerOf(tileId);
            const ownerLower = owner.toLowerCase();
            
            this.ownershipCache.set(cacheKey, {
                owner: ownerLower,
                timestamp: Date.now()
            });

            return ownerLower;
        } catch (error) {
            console.error(`Failed to get owner for tile ${tileId}:`, error);
            return null;
        }
    }

    coordinatesToTileId(x, y) {
        if (x < 0 || x > 7 || y < 0 || y > 7) {
            throw new Error('Coordinates out of bounds (must be 0-7)');
        }
        return y * 8 + x;
    }

    tileIdToCoordinates(tileId) {
        if (tileId < 0 || tileId > 63) {
            throw new Error('TileId out of bounds (must be 0-63)');
        }
        return {
            x: tileId % 8,
            y: Math.floor(tileId / 8)
        };
    }

    generateJWT(address, sessionId = null) {
        const session = sessionId || crypto.randomUUID();
        
        const payload = {
            address: address.toLowerCase(),
            sessionId: session,
            iat: Math.floor(Date.now() / 1000),
            exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60) // 24 hours
        };

        // Store session info
        this.activeSessions.set(`${address.toLowerCase()}_${session}`, {
            created: Date.now(),
            lastAccess: Date.now(),
            valid: true
        });

        return jwt.sign(payload, this.config.jwtSecret);
    }

    isSessionValid(address, sessionId) {
        const sessionKey = `${address.toLowerCase()}_${sessionId}`;
        const session = this.activeSessions.get(sessionKey);
        
        if (!session || !session.valid) {
            return false;
        }

        // Update last access time
        session.lastAccess = Date.now();
        return true;
    }

    revokeSession(address, sessionId) {
        const sessionKey = `${address.toLowerCase()}_${sessionId}`;
        const session = this.activeSessions.get(sessionKey);
        
        if (session) {
            session.valid = false;
        }
    }

    // Cleanup expired sessions
    cleanupExpiredSessions() {
        const now = Date.now();
        const maxAge = 24 * 60 * 60 * 1000; // 24 hours

        for (const [sessionKey, session] of this.activeSessions.entries()) {
            if (now - session.lastAccess > maxAge) {
                this.activeSessions.delete(sessionKey);
            }
        }
    }
}

module.exports = AuthenticationMiddleware;