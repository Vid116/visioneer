const axios = require('axios');
const axiosRetry = require('axios-retry');

/**
 * HTTP Communication Layer for ESP32 LED Board
 * Handles sending color update commands to ESP32 REST API with retry logic,
 * error handling, and connection status monitoring
 */
class ESP32HttpClient {
  constructor(config = {}) {
    this.baseURL = config.baseURL || 'http://192.168.1.100';
    this.port = config.port || 80;
    this.timeout = config.timeout || 5000;
    this.maxRetries = config.maxRetries || 3;
    this.retryDelay = config.retryDelay || 1000;
    
    // Connection status tracking
    this.connectionStatus = {
      isConnected: false,
      lastSuccessfulRequest: null,
      lastError: null,
      consecutiveFailures: 0
    };

    // Initialize axios instance with retry configuration
    this.httpClient = axios.create({
      baseURL: `${this.baseURL}:${this.port}`,
      timeout: this.timeout,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json'
      }
    });

    this.setupRetryLogic();
    this.setupInterceptors();
  }

  /**
   * Configure axios-retry with exponential backoff
   */
  setupRetryLogic() {
    axiosRetry(this.httpClient, {
      retries: this.maxRetries,
      retryDelay: (retryCount, error) => {
        // Exponential backoff with jitter
        const baseDelay = this.retryDelay;
        const exponentialDelay = Math.pow(2, retryCount - 1) * baseDelay;
        const jitter = Math.random() * 0.1 * exponentialDelay;
        return exponentialDelay + jitter;
      },
      retryCondition: (error) => {
        // Retry on network errors, timeouts, and 5xx server errors
        return axiosRetry.isNetworkOrIdempotentRequestError(error) ||
               (error.response && error.response.status >= 500) ||
               (error.code && ['ECONNRESET', 'ECONNREFUSED', 'ETIMEDOUT'].includes(error.code));
      },
      onRetry: (retryCount, error, requestConfig) => {
        console.warn(`ESP32 HTTP Client - Retry attempt ${retryCount} for ${requestConfig.url}:`, error.message);
      }
    });
  }

  /**
   * Setup request/response interceptors for logging and status tracking
   */
  setupInterceptors() {
    // Request interceptor
    this.httpClient.interceptors.request.use(
      (config) => {
        console.log(`ESP32 HTTP Client - Sending ${config.method?.toUpperCase()} request to ${config.url}`);
        return config;
      },
      (error) => {
        console.error('ESP32 HTTP Client - Request error:', error);
        return Promise.reject(error);
      }
    );

    // Response interceptor
    this.httpClient.interceptors.response.use(
      (response) => {
        this.updateConnectionStatus(true);
        console.log(`ESP32 HTTP Client - Successful response from ${response.config.url} (${response.status})`);
        return response;
      },
      (error) => {
        this.updateConnectionStatus(false, error);
        console.error(`ESP32 HTTP Client - Response error:`, {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
          code: error.code
        });
        return Promise.reject(error);
      }
    );
  }

  /**
   * Update connection status tracking
   */
  updateConnectionStatus(isSuccess, error = null) {
    if (isSuccess) {
      this.connectionStatus.isConnected = true;
      this.connectionStatus.lastSuccessfulRequest = new Date();
      this.connectionStatus.consecutiveFailures = 0;
      this.connectionStatus.lastError = null;
    } else {
      this.connectionStatus.isConnected = false;
      this.connectionStatus.consecutiveFailures++;
      this.connectionStatus.lastError = {
        message: error?.message || 'Unknown error',
        code: error?.code,
        status: error?.response?.status,
        timestamp: new Date()
      };
    }
  }

  /**
   * Send color update command to ESP32
   * @param {Object} colorData - Color data object
   * @param {number} colorData.tileId - Tile identifier
   * @param {Object} colorData.color - RGB color values
   * @param {number} colorData.color.r - Red value (0-255)
   * @param {number} colorData.color.g - Green value (0-255)
   * @param {number} colorData.color.b - Blue value (0-255)
   * @returns {Promise<Object>} Response from ESP32
   */
  async updateTileColor(colorData) {
    try {
      this.validateColorData(colorData);
      
      const payload = {
        tileId: colorData.tileId,
        red: colorData.color.r,
        green: colorData.color.g,
        blue: colorData.color.b,
        timestamp: Date.now()
      };

      const response = await this.httpClient.post('/api/tile/color', payload);
      
      console.log(`ESP32 HTTP Client - Successfully updated tile ${colorData.tileId} color`);
      return {
        success: true,
        data: response.data,
        tileId: colorData.tileId
      };

    } catch (error) {
      console.error(`ESP32 HTTP Client - Failed to update tile ${colorData.tileId} color:`, error.message);
      throw error;
    }
  }

  /**
   * Send batch color update command to ESP32
   * @param {Array} colorUpdates - Array of color update objects
   * @returns {Promise<Object>} Batch update response
   */
  async updateMultipleTiles(colorUpdates) {
    try {
      // Validate all color data first
      colorUpdates.forEach(colorData => this.validateColorData(colorData));

      const payload = {
        updates: colorUpdates.map(colorData => ({
          tileId: colorData.tileId,
          red: colorData.color.r,
          green: colorData.color.g,
          blue: colorData.color.b
        })),
        timestamp: Date.now()
      };

      const response = await this.httpClient.post('/api/tiles/batch-update', payload);
      
      console.log(`ESP32 HTTP Client - Successfully updated ${colorUpdates.length} tiles`);
      return {
        success: true,
        data: response.data,
        updatedCount: colorUpdates.length
      };

    } catch (error) {
      console.error(`ESP32 HTTP Client - Failed to update multiple tiles:`, error.message);
      throw error;
    }
  }

  /**
   * Get current ESP32 status and configuration
   * @returns {Promise<Object>} ESP32 status information
   */
  async getStatus() {
    try {
      const response = await this.httpClient.get('/api/status');
      
      return {
        success: true,
        esp32Status: response.data,
        connectionStatus: this.connectionStatus
      };

    } catch (error) {
      console.error('ESP32 HTTP Client - Failed to get status:', error.message);
      throw error;
    }
  }

  /**
   * Test connection to ESP32
   * @returns {Promise<boolean>} Connection test result
   */
  async testConnection() {
    try {
      const response = await this.httpClient.get('/api/health');
      console.log('ESP32 HTTP Client - Connection test successful');
      return true;

    } catch (error) {
      console.warn('ESP32 HTTP Client - Connection test failed:', error.message);
      return false;
    }
  }

  /**
   * Set all tiles to a specific color (useful for testing)
   * @param {Object} color - RGB color values
   * @returns {Promise<Object>} Response from ESP32
   */
  async setAllTiles(color) {
    try {
      const payload = {
        red: color.r,
        green: color.g,
        blue: color.b,
        timestamp: Date.now()
      };

      const response = await this.httpClient.post('/api/tiles/all', payload);
      
      console.log('ESP32 HTTP Client - Successfully set all tiles color');
      return {
        success: true,
        data: response.data
      };

    } catch (error) {
      console.error('ESP32 HTTP Client - Failed to set all tiles color:', error.message);
      throw error;
    }
  }

  /**
   * Validate color data structure
   * @param {Object} colorData - Color data to validate
   */
  validateColorData(colorData) {
    if (!colorData || typeof colorData !== 'object') {
      throw new Error('Invalid color data: must be an object');
    }

    if (typeof colorData.tileId !== 'number' || colorData.tileId < 0) {
      throw new Error('Invalid tileId: must be a non-negative number');
    }

    if (!colorData.color || typeof colorData.color !== 'object') {
      throw new Error('Invalid color: must be an object with r, g, b properties');
    }

    const { r, g, b } = colorData.color;
    
    if (!this.isValidColorValue(r) || !this.isValidColorValue(g) || !this.isValidColorValue(b)) {
      throw new Error('Invalid color values: r, g, b must be integers between 0 and 255');
    }
  }

  /**
   * Validate individual color value (0-255)
   * @param {number} value - Color value to validate
   * @returns {boolean} Validation result
   */
  isValidColorValue(value) {
    return typeof value === 'number' && 
           Number.isInteger(value) && 
           value >= 0 && 
           value <= 255;
  }

  /**
   * Get current connection status
   * @returns {Object} Connection status information
   */
  getConnectionStatus() {
    return {
      ...this.connectionStatus,
      healthyConnection: this.connectionStatus.isConnected && 
                        this.connectionStatus.consecutiveFailures < 3
    };
  }

  /**
   * Update ESP32 connection configuration
   * @param {Object} config - New configuration
   */
  updateConfig(config) {
    if (config.baseURL) this.baseURL = config.baseURL;
    if (config.port) this.port = config.port;
    if (config.timeout) this.timeout = config.timeout;

    // Update axios instance base URL
    this.httpClient.defaults.baseURL = `${this.baseURL}:${this.port}`;
    this.httpClient.defaults.timeout = this.timeout;
    
    console.log(`ESP32 HTTP Client - Configuration updated: ${this.baseURL}:${this.port}`);
  }
}

module.exports = ESP32HttpClient;