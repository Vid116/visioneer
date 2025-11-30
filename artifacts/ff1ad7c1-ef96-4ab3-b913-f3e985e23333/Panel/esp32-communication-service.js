const ESP32HttpClient = require('./esp32-http-client');
const EventEmitter = require('events');

/**
 * ESP32 Communication Service
 * High-level service that manages communication with ESP32 LED boards,
 * handles connection monitoring, and provides queue management for color updates
 */
class ESP32CommunicationService extends EventEmitter {
  constructor(config = {}) {
    super();
    
    this.config = {
      esp32BaseURL: config.esp32BaseURL || 'http://192.168.1.100',
      esp32Port: config.esp32Port || 80,
      healthCheckInterval: config.healthCheckInterval || 30000, // 30 seconds
      maxQueueSize: config.maxQueueSize || 100,
      retryFailedUpdates: config.retryFailedUpdates !== false, // default true
      ...config
    };

    // Initialize HTTP client
    this.httpClient = new ESP32HttpClient({
      baseURL: this.config.esp32BaseURL,
      port: this.config.esp32Port,
      timeout: this.config.timeout || 5000,
      maxRetries: this.config.maxRetries || 3
    });

    // Update queue for failed requests
    this.updateQueue = [];
    this.isProcessingQueue = false;

    // Health monitoring
    this.healthCheckTimer = null;
    this.isHealthy = false;

    this.startHealthMonitoring();
  }

  /**
   * Start periodic health monitoring of ESP32 connection
   */
  startHealthMonitoring() {
    this.healthCheckTimer = setInterval(async () => {
      try {
        const isHealthy = await this.httpClient.testConnection();
        
        if (isHealthy !== this.isHealthy) {
          this.isHealthy = isHealthy;
          this.emit(isHealthy ? 'connected' : 'disconnected');
          
          console.log(`ESP32 Communication Service - Connection ${isHealthy ? 'restored' : 'lost'}`);
          
          // Process queued updates when connection is restored
          if (isHealthy && this.updateQueue.length > 0) {
            this.processUpdateQueue();
          }
        }

      } catch (error) {
        console.error('ESP32 Communication Service - Health check error:', error.message);
      }
    }, this.config.healthCheckInterval);

    console.log(`ESP32 Communication Service - Health monitoring started (${this.config.healthCheckInterval}ms interval)`);
  }

  /**
   * Stop health monitoring
   */
  stopHealthMonitoring() {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      console.log('ESP32 Communication Service - Health monitoring stopped');
    }
  }

  /**
   * Send single tile color update
   * @param {number} tileId - Tile identifier
   * @param {Object} color - RGB color object {r, g, b}
   * @param {Object} metadata - Additional metadata (NFT data, etc.)
   * @returns {Promise<Object>} Update result
   */
  async updateTileColor(tileId, color, metadata = {}) {
    const colorData = { tileId, color };
    
    try {
      const result = await this.httpClient.updateTileColor(colorData);
      
      // Emit successful update event
      this.emit('tileUpdated', {
        tileId,
        color,
        metadata,
        success: true,
        timestamp: new Date()
      });

      return result;

    } catch (error) {
      console.error(`ESP32 Communication Service - Failed to update tile ${tileId}:`, error.message);
      
      // Queue failed update for retry if enabled
      if (this.config.retryFailedUpdates) {
        this.queueFailedUpdate({ tileId, color, metadata, type: 'single' });
      }

      // Emit failed update event
      this.emit('updateFailed', {
        tileId,
        color,
        metadata,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Send batch tile color updates
   * @param {Array} updates - Array of update objects [{tileId, color, metadata}]
   * @returns {Promise<Object>} Batch update result
   */
  async updateMultipleTiles(updates) {
    try {
      const colorUpdates = updates.map(update => ({
        tileId: update.tileId,
        color: update.color
      }));

      const result = await this.httpClient.updateMultipleTiles(colorUpdates);
      
      // Emit successful batch update event
      this.emit('batchUpdateCompleted', {
        updates,
        success: true,
        updatedCount: updates.length,
        timestamp: new Date()
      });

      return result;

    } catch (error) {
      console.error('ESP32 Communication Service - Failed to update multiple tiles:', error.message);
      
      // Queue failed batch update for retry if enabled
      if (this.config.retryFailedUpdates) {
        this.queueFailedUpdate({ updates, type: 'batch' });
      }

      // Emit failed batch update event
      this.emit('batchUpdateFailed', {
        updates,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Update tile color based on NFT event data
   * @param {Object} nftEvent - NFT event data from blockchain
   * @returns {Promise<Object>} Update result
   */
  async updateTileFromNFTEvent(nftEvent) {
    try {
      // Extract tile mapping and color from NFT event
      const { tileId, color } = this.mapNFTEventToTile(nftEvent);
      
      if (tileId === null || !color) {
        throw new Error('Invalid NFT event mapping - no tile or color determined');
      }

      const result = await this.updateTileColor(tileId, color, { 
        nftEvent,
        source: 'blockchain' 
      });

      console.log(`ESP32 Communication Service - Updated tile ${tileId} from NFT event`, {
        tokenId: nftEvent.tokenId,
        eventType: nftEvent.eventType,
        color
      });

      return result;

    } catch (error) {
      console.error('ESP32 Communication Service - Failed to update tile from NFT event:', error.message);
      throw error;
    }
  }

  /**
   * Map NFT event data to tile ID and color
   * This is a placeholder implementation - should be customized based on specific NFT collection logic
   * @param {Object} nftEvent - NFT event data
   * @returns {Object} Mapped tile data {tileId, color}
   */
  mapNFTEventToTile(nftEvent) {
    // Example mapping logic - customize based on your NFT collection
    const tileId = nftEvent.tokenId ? (nftEvent.tokenId % 100) : null; // Map token ID to tile (0-99)
    
    let color = { r: 0, g: 0, b: 0 };
    
    // Map based on event type
    switch (nftEvent.eventType) {
      case 'mint':
        color = { r: 0, g: 255, b: 0 }; // Green for mint
        break;
      case 'transfer':
        color = { r: 0, g: 0, b: 255 }; // Blue for transfer
        break;
      case 'sale':
        color = { r: 255, g: 215, b: 0 }; // Gold for sale
        break;
      default:
        color = { r: 255, g: 255, b: 255 }; // White for other events
    }

    // Add some variation based on transaction value or other properties
    if (nftEvent.value) {
      const intensity = Math.min(255, Math.floor(nftEvent.value / 1000) * 50);
      color.r = Math.min(255, color.r + intensity);
    }

    return { tileId, color };
  }

  /**
   * Set all tiles to a specific color (useful for system states)
   * @param {Object} color - RGB color object
   * @param {string} reason - Reason for the change
   * @returns {Promise<Object>} Update result
   */
  async setAllTiles(color, reason = 'manual') {
    try {
      const result = await this.httpClient.setAllTiles(color);
      
      this.emit('allTilesUpdated', {
        color,
        reason,
        success: true,
        timestamp: new Date()
      });

      console.log(`ESP32 Communication Service - Set all tiles to color (${reason}):`, color);
      return result;

    } catch (error) {
      console.error('ESP32 Communication Service - Failed to set all tiles:', error.message);
      
      this.emit('allTilesUpdateFailed', {
        color,
        reason,
        error: error.message,
        timestamp: new Date()
      });

      throw error;
    }
  }

  /**
   * Queue failed update for retry later
   * @param {Object} updateData - Failed update data
   */
  queueFailedUpdate(updateData) {
    if (this.updateQueue.length >= this.config.maxQueueSize) {
      console.warn('ESP32 Communication Service - Update queue is full, dropping oldest item');
      this.updateQueue.shift(); // Remove oldest item
    }

    this.updateQueue.push({
      ...updateData,
      queuedAt: new Date(),
      attempts: 0
    });

    console.log(`ESP32 Communication Service - Queued failed update (queue size: ${this.updateQueue.length})`);
  }

  /**
   * Process queued failed updates
   */
  async processUpdateQueue() {
    if (this.isProcessingQueue || this.updateQueue.length === 0) {
      return;
    }

    this.isProcessingQueue = true;
    console.log(`ESP32 Communication Service - Processing ${this.updateQueue.length} queued updates`);

    const maxAttempts = 3;
    const processedItems = [];

    for (const queuedUpdate of this.updateQueue) {
      try {
        queuedUpdate.attempts++;

        if (queuedUpdate.type === 'single') {
          await this.httpClient.updateTileColor({
            tileId: queuedUpdate.tileId,
            color: queuedUpdate.color
          });
        } else if (queuedUpdate.type === 'batch') {
          const colorUpdates = queuedUpdate.updates.map(update => ({
            tileId: update.tileId,
            color: update.color
          }));
          await this.httpClient.updateMultipleTiles(colorUpdates);
        }

        // Successful retry
        processedItems.push(queuedUpdate);
        console.log(`ESP32 Communication Service - Successfully processed queued update (attempt ${queuedUpdate.attempts})`);

      } catch (error) {
        console.warn(`ESP32 Communication Service - Failed to process queued update (attempt ${queuedUpdate.attempts}):`, error.message);

        if (queuedUpdate.attempts >= maxAttempts) {
          processedItems.push(queuedUpdate);
          console.error(`ESP32 Communication Service - Dropping queued update after ${maxAttempts} attempts`);
        }
      }
    }

    // Remove processed items from queue
    this.updateQueue = this.updateQueue.filter(item => !processedItems.includes(item));
    
    console.log(`ESP32 Communication Service - Queue processing completed. Remaining items: ${this.updateQueue.length}`);
    this.isProcessingQueue = false;
  }

  /**
   * Get current service status
   * @returns {Object} Service status information
   */
  async getStatus() {
    try {
      const esp32Status = await this.httpClient.getStatus();
      
      return {
        service: {
          isHealthy: this.isHealthy,
          queueSize: this.updateQueue.length,
          healthCheckInterval: this.config.healthCheckInterval,
          lastHealthCheck: new Date()
        },
        esp32: esp32Status,
        configuration: {
          baseURL: this.config.esp32BaseURL,
          port: this.config.esp32Port,
          retryFailedUpdates: this.config.retryFailedUpdates
        }
      };

    } catch (error) {
      return {
        service: {
          isHealthy: false,
          queueSize: this.updateQueue.length,
          error: error.message
        },
        esp32: null,
        configuration: {
          baseURL: this.config.esp32BaseURL,
          port: this.config.esp32Port,
          retryFailedUpdates: this.config.retryFailedUpdates
        }
      };
    }
  }

  /**
   * Update ESP32 connection configuration
   * @param {Object} config - New configuration
   */
  updateConfiguration(config) {
    // Update internal config
    Object.assign(this.config, config);

    // Update HTTP client configuration
    if (config.esp32BaseURL || config.esp32Port || config.timeout || config.maxRetries) {
      this.httpClient.updateConfig({
        baseURL: config.esp32BaseURL,
        port: config.esp32Port,
        timeout: config.timeout,
        maxRetries: config.maxRetries
      });
    }

    // Restart health monitoring if interval changed
    if (config.healthCheckInterval) {
      this.stopHealthMonitoring();
      this.startHealthMonitoring();
    }

    console.log('ESP32 Communication Service - Configuration updated');
  }

  /**
   * Cleanup resources
   */
  destroy() {
    this.stopHealthMonitoring();
    this.removeAllListeners();
    console.log('ESP32 Communication Service - Service destroyed');
  }
}

module.exports = ESP32CommunicationService;