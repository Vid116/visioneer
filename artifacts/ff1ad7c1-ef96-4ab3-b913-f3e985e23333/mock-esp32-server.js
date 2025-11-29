const express = require('express');
const cors = require('cors');

/**
 * Mock ESP32 Server for Testing HTTP Communication
 * Simulates ESP32 REST API endpoints for development and testing
 */
class MockESP32Server {
  constructor(port = 3001) {
    this.port = port;
    this.app = express();
    this.server = null;
    
    // Simulated ESP32 state
    this.ledState = {
      tiles: new Array(100).fill(null).map((_, index) => ({
        id: index,
        r: 0,
        g: 0,
        b: 0,
        lastUpdate: null
      })),
      totalTiles: 100,
      isOnline: true,
      firmware: '1.0.0',
      freeHeap: 50000,
      uptime: 0
    };

    this.startTime = Date.now();
    this.setupMiddleware();
    this.setupRoutes();
  }

  setupMiddleware() {
    this.app.use(cors());
    this.app.use(express.json({ limit: '10mb' }));
    
    // Logging middleware
    this.app.use((req, res, next) => {
      console.log(`Mock ESP32 - ${new Date().toISOString()} - ${req.method} ${req.path}`);
      next();
    });

    // Simulate occasional network issues for testing retry logic
    this.app.use((req, res, next) => {
      // 5% chance of simulating network error
      if (Math.random() < 0.05) {
        console.log('Mock ESP32 - Simulating network error');
        return res.status(503).json({ error: 'Service temporarily unavailable' });
      }
      
      // 3% chance of timeout (delay response)
      if (Math.random() < 0.03) {
        console.log('Mock ESP32 - Simulating slow response');
        setTimeout(() => next(), 3000);
      } else {
        next();
      }
    });
  }

  setupRoutes() {
    // Health check endpoint
    this.app.get('/api/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: Date.now() - this.startTime
      });
    });

    // Status endpoint
    this.app.get('/api/status', (req, res) => {
      this.ledState.uptime = Date.now() - this.startTime;
      res.json({
        ...this.ledState,
        memory: {
          freeHeap: this.ledState.freeHeap - Math.floor(Math.random() * 1000), // Simulate varying memory
          maxAllocHeap: 80000
        },
        wifi: {
          ssid: 'TestNetwork',
          rssi: -45 + Math.floor(Math.random() * 20), // Simulate signal variation
          ip: '192.168.1.100'
        }
      });
    });

    // Single tile color update
    this.app.post('/api/tile/color', (req, res) => {
      try {
        const { tileId, red, green, blue, timestamp } = req.body;
        
        // Validate input
        if (typeof tileId !== 'number' || tileId < 0 || tileId >= this.ledState.totalTiles) {
          return res.status(400).json({ 
            error: 'Invalid tileId',
            validRange: `0-${this.ledState.totalTiles - 1}`
          });
        }

        if (!this.isValidColorValue(red) || !this.isValidColorValue(green) || !this.isValidColorValue(blue)) {
          return res.status(400).json({ 
            error: 'Invalid color values',
            message: 'r, g, b values must be integers between 0 and 255'
          });
        }

        // Update tile state
        this.ledState.tiles[tileId] = {
          id: tileId,
          r: red,
          g: green,
          b: blue,
          lastUpdate: new Date().toISOString()
        };

        console.log(`Mock ESP32 - Updated tile ${tileId} to RGB(${red}, ${green}, ${blue})`);

        res.json({
          success: true,
          tileId,
          color: { r: red, g: green, b: blue },
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Mock ESP32 - Error updating tile color:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Batch tile color update
    this.app.post('/api/tiles/batch-update', (req, res) => {
      try {
        const { updates, timestamp } = req.body;
        
        if (!Array.isArray(updates)) {
          return res.status(400).json({ error: 'Updates must be an array' });
        }

        const results = [];
        const errors = [];

        for (const update of updates) {
          const { tileId, red, green, blue } = update;
          
          // Validate each update
          if (typeof tileId !== 'number' || tileId < 0 || tileId >= this.ledState.totalTiles) {
            errors.push({ tileId, error: 'Invalid tileId' });
            continue;
          }

          if (!this.isValidColorValue(red) || !this.isValidColorValue(green) || !this.isValidColorValue(blue)) {
            errors.push({ tileId, error: 'Invalid color values' });
            continue;
          }

          // Update tile state
          this.ledState.tiles[tileId] = {
            id: tileId,
            r: red,
            g: green,
            b: blue,
            lastUpdate: new Date().toISOString()
          };

          results.push({ tileId, success: true });
        }

        console.log(`Mock ESP32 - Batch updated ${results.length} tiles (${errors.length} errors)`);

        res.json({
          success: errors.length === 0,
          updatedCount: results.length,
          errorCount: errors.length,
          results,
          errors,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        console.error('Mock ESP32 - Error in batch update:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Set all tiles to same color
    this.app.post('/api/tiles/all', (req, res) => {
      try {
        const { red, green, blue, timestamp } = req.body;
        
        if (!this.isValidColorValue(red) || !this.isValidColorValue(green) || !this.isValidColorValue(blue)) {
          return res.status(400).json({ 
            error: 'Invalid color values',
            message: 'r, g, b values must be integers between 0 and 255'
          });
        }

        const updateTime = new Date().toISOString();

        // Update all tiles
        for (let i = 0; i < this.ledState.totalTiles; i++) {
          this.ledState.tiles[i] = {
            id: i,
            r: red,
            g: green,
            b: blue,
            lastUpdate: updateTime
          };
        }

        console.log(`Mock ESP32 - Set all tiles to RGB(${red}, ${green}, ${blue})`);

        res.json({
          success: true,
          color: { r: red, g: green, b: blue },
          updatedCount: this.ledState.totalTiles,
          timestamp: updateTime
        });

      } catch (error) {
        console.error('Mock ESP32 - Error setting all tiles:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get specific tile state
    this.app.get('/api/tile/:tileId', (req, res) => {
      try {
        const tileId = parseInt(req.params.tileId);
        
        if (isNaN(tileId) || tileId < 0 || tileId >= this.ledState.totalTiles) {
          return res.status(404).json({ error: 'Tile not found' });
        }

        res.json(this.ledState.tiles[tileId]);

      } catch (error) {
        console.error('Mock ESP32 - Error getting tile state:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Get all tiles state
    this.app.get('/api/tiles', (req, res) => {
      try {
        const { limit = 100, offset = 0 } = req.query;
        const limitNum = Math.min(parseInt(limit) || 100, this.ledState.totalTiles);
        const offsetNum = Math.max(parseInt(offset) || 0, 0);

        const tiles = this.ledState.tiles.slice(offsetNum, offsetNum + limitNum);

        res.json({
          tiles,
          total: this.ledState.totalTiles,
          limit: limitNum,
          offset: offsetNum
        });

      } catch (error) {
        console.error('Mock ESP32 - Error getting tiles state:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // Reset all tiles (turn off)
    this.app.post('/api/reset', (req, res) => {
      try {
        const updateTime = new Date().toISOString();

        for (let i = 0; i < this.ledState.totalTiles; i++) {
          this.ledState.tiles[i] = {
            id: i,
            r: 0,
            g: 0,
            b: 0,
            lastUpdate: updateTime
          };
        }

        console.log('Mock ESP32 - Reset all tiles (turned off)');

        res.json({
          success: true,
          message: 'All tiles reset',
          timestamp: updateTime
        });

      } catch (error) {
        console.error('Mock ESP32 - Error resetting tiles:', error);
        res.status(500).json({ error: 'Internal server error' });
      }
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({ 
        error: 'Endpoint not found',
        availableEndpoints: [
          'GET /api/health',
          'GET /api/status',
          'POST /api/tile/color',
          'POST /api/tiles/batch-update',
          'POST /api/tiles/all',
          'GET /api/tile/:tileId',
          'GET /api/tiles',
          'POST /api/reset'
        ]
      });
    });

    // Error handler
    this.app.use((err, req, res, next) => {
      console.error('Mock ESP32 - Server error:', err);
      res.status(500).json({ error: 'Internal server error' });
    });
  }

  isValidColorValue(value) {
    return typeof value === 'number' && 
           Number.isInteger(value) && 
           value >= 0 && 
           value <= 255;
  }

  start() {
    return new Promise((resolve, reject) => {
      this.server = this.app.listen(this.port, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log(`Mock ESP32 Server running on http://localhost:${this.port}`);
          console.log('Available endpoints:');
          console.log('  GET  /api/health - Health check');
          console.log('  GET  /api/status - Full system status');
          console.log('  POST /api/tile/color - Update single tile');
          console.log('  POST /api/tiles/batch-update - Update multiple tiles');
          console.log('  POST /api/tiles/all - Set all tiles to same color');
          console.log('  GET  /api/tile/:id - Get single tile state');
          console.log('  GET  /api/tiles - Get all tiles state');
          console.log('  POST /api/reset - Reset all tiles');
          resolve();
        }
      });
    });
  }

  stop() {
    return new Promise((resolve) => {
      if (this.server) {
        this.server.close(() => {
          console.log('Mock ESP32 Server stopped');
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  // Simulate random tile updates (for testing)
  startRandomUpdates(intervalMs = 5000) {
    this.randomUpdateInterval = setInterval(() => {
      const tileId = Math.floor(Math.random() * this.ledState.totalTiles);
      const color = {
        r: Math.floor(Math.random() * 256),
        g: Math.floor(Math.random() * 256),
        b: Math.floor(Math.random() * 256)
      };

      this.ledState.tiles[tileId] = {
        id: tileId,
        ...color,
        lastUpdate: new Date().toISOString()
      };

      console.log(`Mock ESP32 - Random update: Tile ${tileId} -> RGB(${color.r}, ${color.g}, ${color.b})`);
    }, intervalMs);

    console.log(`Mock ESP32 - Started random tile updates (${intervalMs}ms interval)`);
  }

  stopRandomUpdates() {
    if (this.randomUpdateInterval) {
      clearInterval(this.randomUpdateInterval);
      this.randomUpdateInterval = null;
      console.log('Mock ESP32 - Stopped random tile updates');
    }
  }
}

// CLI usage
if (require.main === module) {
  const port = process.env.MOCK_ESP32_PORT || 3001;
  const mockServer = new MockESP32Server(port);

  mockServer.start().catch(console.error);

  // Graceful shutdown
  process.on('SIGINT', async () => {
    console.log('Shutting down Mock ESP32 Server...');
    mockServer.stopRandomUpdates();
    await mockServer.stop();
    process.exit(0);
  });
}

module.exports = MockESP32Server;