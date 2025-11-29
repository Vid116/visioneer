const express = require('express');
const redis = require('redis');
const axios = require('axios');
const crypto = require('crypto');

class NFTEventProcessor {
  constructor() {
    this.app = express();
    this.redisClient = null;
    this.gridSize = 8; // 8x8 LED grid
    this.esp32BaseUrl = process.env.ESP32_BASE_URL || 'http://192.168.1.100';
    
    // Color mappings for different NFT events
    this.eventColors = {
      'TRANSFER': { r: 0, g: 100, b: 255 },    // Blue for transfers
      'SALE': { r: 255, g: 215, b: 0 },       // Gold for sales
      'MINT': { r: 255, g: 255, b: 255 }      // White for mints
    };
    
    this.init();
  }

  async init() {
    // Initialize Redis connection
    this.redisClient = redis.createClient({
      host: process.env.REDIS_HOST || 'localhost',
      port: process.env.REDIS_PORT || 6379,
      retry_strategy: (times) => Math.min(times * 50, 2000)
    });

    await this.redisClient.connect();
    
    // Initialize Express middleware
    this.app.use(express.json());
    this.app.use(this.validateWebhook.bind(this));
    
    // Routes
    this.app.post('/webhook/nft-activity', this.handleNFTActivity.bind(this));
    this.app.get('/grid/status', this.getGridStatus.bind(this));
    this.app.post('/grid/test', this.testGridPattern.bind(this));
    
    // Initialize grid state in Redis
    await this.initializeGrid();
    
    console.log('NFT Event Processor initialized');
  }

  // Validate Alchemy webhook signature
  validateWebhook(req, res, next) {
    const signature = req.headers['x-alchemy-signature'];
    const signingKey = process.env.ALCHEMY_SIGNING_KEY;
    
    if (!signature || !signingKey) {
      return res.status(401).json({ error: 'Missing webhook signature' });
    }

    const body = JSON.stringify(req.body);
    const hmac = crypto.createHmac('sha256', signingKey);
    hmac.update(body, 'utf8');
    const computedSignature = hmac.digest('hex');
    
    if (signature !== computedSignature) {
      return res.status(401).json({ error: 'Invalid webhook signature' });
    }
    
    next();
  }

  // Initialize 8x8 grid state in Redis
  async initializeGrid() {
    const gridKey = 'led_grid_state';
    const gridExists = await this.redisClient.exists(gridKey);
    
    if (!gridExists) {
      const initialGrid = Array(this.gridSize).fill(null).map(() => 
        Array(this.gridSize).fill({ r: 0, g: 0, b: 0 })
      );
      
      await this.redisClient.hSet(gridKey, 'current', JSON.stringify(initialGrid));
      await this.redisClient.hSet(gridKey, 'last_updated', new Date().toISOString());
      console.log('Grid state initialized in Redis');
    }
  }

  // Main webhook handler for NFT activity
  async handleNFTActivity(req, res) {
    try {
      const { webhookId, id, event } = req.body;
      
      if (event.type !== 'NFT_ACTIVITY') {
        return res.status(400).json({ error: 'Invalid event type' });
      }

      console.log(`Processing NFT activity webhook: ${id}`);
      
      // Process each activity in the event
      for (const activity of event.activity) {
        await this.processNFTEvent(activity, event.network);
      }

      // Log event to Redis for history
      await this.logEvent(id, req.body);
      
      res.status(200).json({ 
        status: 'success', 
        processed: event.activity.length,
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error processing NFT activity:', error);
      res.status(500).json({ error: 'Internal server error' });
    }
  }

  // Process individual NFT event and update LED grid
  async processNFTEvent(activity, network) {
    const eventType = this.determineEventType(activity);
    const color = this.eventColors[eventType];
    
    console.log(`Processing ${eventType} event for token ${activity.erc721TokenId || activity.tokenId}`);
    
    // Determine grid position based on token ID and contract
    const gridPosition = this.calculateGridPosition(activity);
    
    // Update grid state in Redis
    await this.updateGridTile(gridPosition.x, gridPosition.y, color, {
      eventType,
      contractAddress: activity.contractAddress,
      tokenId: activity.erc721TokenId || activity.tokenId,
      fromAddress: activity.fromAddress,
      toAddress: activity.toAddress,
      timestamp: new Date().toISOString(),
      transactionHash: activity.hash,
      network
    });

    // Send color update to ESP32
    await this.sendColorToESP32(gridPosition.x, gridPosition.y, color);
  }

  // Determine event type from activity data
  determineEventType(activity) {
    const { fromAddress, toAddress } = activity;
    
    // Check for mint (from null/zero address)
    if (fromAddress === '0x0000000000000000000000000000000000000000' || 
        fromAddress === null || fromAddress === '') {
      return 'MINT';
    }
    
    // Check for sale (could be enhanced with marketplace detection)
    const knownMarketplaces = [
      '0x7be8076f4ea4a4ad08075c2508e481d6c946d12b', // OpenSea
      '0x7f268357a8c2552623316e2562d90e642bb538e5', // OpenSea (legacy)
      '0x00000000006c3852cbef3e08e8df289169ede581'  // OpenSea Seaport
    ];
    
    if (knownMarketplaces.includes(fromAddress.toLowerCase()) ||
        knownMarketplaces.includes(toAddress.toLowerCase())) {
      return 'SALE';
    }
    
    // Default to transfer
    return 'TRANSFER';
  }

  // Calculate grid position based on token data
  calculateGridPosition(activity) {
    const tokenId = activity.erc721TokenId || activity.tokenId || '0';
    const contractAddress = activity.contractAddress;
    
    // Create hash from contract + token ID for consistent positioning
    const hash = crypto.createHash('sha256')
      .update(contractAddress + tokenId)
      .digest('hex');
    
    // Convert to grid coordinates
    const x = parseInt(hash.substr(0, 8), 16) % this.gridSize;
    const y = parseInt(hash.substr(8, 8), 16) % this.gridSize;
    
    return { x, y };
  }

  // Update specific tile in Redis grid state
  async updateGridTile(x, y, color, metadata) {
    const gridKey = 'led_grid_state';
    const currentGrid = JSON.parse(await this.redisClient.hGet(gridKey, 'current'));
    
    // Update tile
    currentGrid[y][x] = { ...color, ...metadata };
    
    // Save updated grid
    await this.redisClient.hSet(gridKey, 'current', JSON.stringify(currentGrid));
    await this.redisClient.hSet(gridKey, 'last_updated', new Date().toISOString());
    
    // Store tile history
    const tileKey = `tile_history:${x}:${y}`;
    await this.redisClient.lPush(tileKey, JSON.stringify({
      color,
      metadata,
      timestamp: new Date().toISOString()
    }));
    
    // Keep only last 100 events per tile
    await this.redisClient.lTrim(tileKey, 0, 99);
    
    console.log(`Updated tile (${x},${y}) with ${metadata.eventType} color`);
  }

  // Send color update to ESP32 via HTTP
  async sendColorToESP32(x, y, color) {
    try {
      const response = await axios.post(`${this.esp32BaseUrl}/color`, {
        x,
        y,
        r: color.r,
        g: color.g,
        b: color.b
      }, {
        timeout: 5000,
        retries: 3,
        retryDelay: 1000
      });
      
      console.log(`Color sent to ESP32 for tile (${x},${y}):`, response.status);
    } catch (error) {
      console.error(`Failed to send color to ESP32 for tile (${x},${y}):`, error.message);
      
      // Store failed update for retry
      await this.redisClient.lPush('failed_updates', JSON.stringify({
        x, y, color,
        timestamp: new Date().toISOString(),
        error: error.message
      }));
    }
  }

  // Log event for history and debugging
  async logEvent(eventId, payload) {
    const eventKey = `events:${eventId}`;
    await this.redisClient.hSet(eventKey, {
      payload: JSON.stringify(payload),
      processed_at: new Date().toISOString()
    });
    
    // Set expiration for event logs (7 days)
    await this.redisClient.expire(eventKey, 7 * 24 * 60 * 60);
    
    // Add to events list
    await this.redisClient.lPush('recent_events', eventId);
    await this.redisClient.lTrim('recent_events', 0, 999); // Keep last 1000 events
  }

  // Get current grid status
  async getGridStatus(req, res) {
    try {
      const gridKey = 'led_grid_state';
      const currentGrid = JSON.parse(await this.redisClient.hGet(gridKey, 'current'));
      const lastUpdated = await this.redisClient.hGet(gridKey, 'last_updated');
      
      res.json({
        grid: currentGrid,
        lastUpdated,
        dimensions: { width: this.gridSize, height: this.gridSize }
      });
    } catch (error) {
      console.error('Error getting grid status:', error);
      res.status(500).json({ error: 'Failed to retrieve grid status' });
    }
  }

  // Test grid with pattern
  async testGridPattern(req, res) {
    try {
      const { pattern, duration = 5000 } = req.body;
      
      if (!pattern || !Array.isArray(pattern)) {
        return res.status(400).json({ error: 'Invalid pattern format' });
      }
      
      // Send pattern to ESP32
      const response = await axios.post(`${this.esp32BaseUrl}/pattern`, {
        pattern,
        duration
      });
      
      res.json({ 
        status: 'success', 
        message: `Test pattern applied for ${duration}ms`,
        esp32Response: response.status
      });
      
    } catch (error) {
      console.error('Error applying test pattern:', error);
      res.status(500).json({ error: 'Failed to apply test pattern' });
    }
  }

  // Retry failed ESP32 updates
  async retryFailedUpdates() {
    const failedUpdates = await this.redisClient.lRange('failed_updates', 0, 9); // Get up to 10 failed updates
    
    for (const updateStr of failedUpdates) {
      const update = JSON.parse(updateStr);
      const age = Date.now() - new Date(update.timestamp).getTime();
      
      // Only retry updates less than 1 hour old
      if (age < 60 * 60 * 1000) {
        try {
          await this.sendColorToESP32(update.x, update.y, update.color);
          // Remove from failed updates on success
          await this.redisClient.lRem('failed_updates', 1, updateStr);
          console.log(`Successfully retried update for tile (${update.x},${update.y})`);
        } catch (error) {
          console.error(`Retry failed for tile (${update.x},${update.y}):`, error.message);
        }
      } else {
        // Remove old failed updates
        await this.redisClient.lRem('failed_updates', 1, updateStr);
      }
    }
  }

  // Start the service
  start(port = 3000) {
    this.app.listen(port, () => {
      console.log(`NFT Event Processor listening on port ${port}`);
    });

    // Set up retry mechanism for failed updates
    setInterval(() => {
      this.retryFailedUpdates();
    }, 30000); // Retry every 30 seconds
  }

  // Graceful shutdown
  async shutdown() {
    console.log('Shutting down NFT Event Processor...');
    await this.redisClient.disconnect();
    process.exit(0);
  }
}

// Handle graceful shutdown
process.on('SIGINT', async () => {
  if (global.processor) {
    await global.processor.shutdown();
  }
});

process.on('SIGTERM', async () => {
  if (global.processor) {
    await global.processor.shutdown();
  }
});

// Initialize and start the processor
if (require.main === module) {
  global.processor = new NFTEventProcessor();
  global.processor.start(process.env.PORT || 3000);
}

module.exports = NFTEventProcessor;