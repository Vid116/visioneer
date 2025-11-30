# ESP32 Backend Integration Implementation

## Integration Architecture

### Communication Flow
1. **Frontend** → **Backend**: User requests color change via web interface
2. **Backend** → **Blockchain**: Verify NFT ownership
3. **Backend** → **ESP32**: Send verified color updates via HTTP/MQTT
4. **ESP32** → **LED Matrix**: Display approved colors

### Backend Service Enhancement

```javascript
// ESP32CommunicationService.js
class ESP32CommunicationService extends EventEmitter {
  constructor(esp32Config) {
    super();
    this.esp32Host = esp32Config.host || 'http://192.168.1.100';
    this.esp32Port = esp32Config.port || 80;
    this.healthCheckInterval = 30000;
    this.maxRetries = 3;
    this.pendingUpdates = new Map();
    
    this.startHealthMonitoring();
  }

  async updateTileColor(tileId, color, ownershipProof) {
    try {
      // Verify ownership before sending to ESP32
      const isOwner = await this.verifyTileOwnership(tileId, ownershipProof);
      if (!isOwner) {
        throw new Error('Ownership verification failed');
      }

      const updateData = {
        tile: tileId,
        color: color,
        timestamp: Date.now()
      };

      const response = await this.sendToESP32('/api/tile/update', updateData);
      
      if (response.success) {
        this.emit('tileUpdated', { tileId, color, success: true });
        return { success: true, message: 'Tile updated successfully' };
      }
    } catch (error) {
      console.error(`Failed to update tile ${tileId}:`, error);
      this.queueFailedUpdate(tileId, color, ownershipProof);
      return { success: false, error: error.message };
    }
  }

  async sendToESP32(endpoint, data) {
    const url = `${this.esp32Host}:${this.esp32Port}${endpoint}`;
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.esp32ApiKey}` // Optional security
      },
      body: JSON.stringify(data),
      timeout: 5000
    });

    if (!response.ok) {
      throw new Error(`ESP32 request failed: ${response.status}`);
    }

    return await response.json();
  }

  async verifyTileOwnership(tileId, proof) {
    // Integration with blockchain verification service
    const ownershipService = require('./OwnershipVerificationService');
    return await ownershipService.verifyOwnership(tileId, proof.walletAddress);
  }

  startHealthMonitoring() {
    setInterval(async () => {
      try {
        const health = await this.checkESP32Health();
        this.emit('healthUpdate', health);
        
        if (health.status === 'healthy') {
          await this.processQueuedUpdates();
        }
      } catch (error) {
        this.emit('healthUpdate', { status: 'unhealthy', error: error.message });
      }
    }, this.healthCheckInterval);
  }

  async checkESP32Health() {
    const response = await this.sendToESP32('/api/health', {});
    return {
      status: response.status === 'ok' ? 'healthy' : 'unhealthy',
      uptime: response.uptime,
      freeHeap: response.freeHeap,
      lastUpdate: Date.now()
    };
  }
}
```

### ESP32 Firmware Integration

```cpp
// ESP32 Integration Enhancements
#include <WiFi.h>
#include <AsyncWebServer.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <HTTPClient.h>

class ESP32TileController {
private:
  AsyncWebServer server;
  CRGB* leds;
  int numLeds;
  String backendUrl;
  String apiKey;
  
public:
  ESP32TileController(int ledCount, String backend, String key) 
    : server(80), numLeds(ledCount), backendUrl(backend), apiKey(key) {
    leds = new CRGB[numLeds];
    FastLED.addLeds<WS2812B, LED_PIN, GRB>(leds, numLeds);
  }

  void setupEndpoints() {
    // Health check endpoint
    server.on("/api/health", HTTP_GET, [this](AsyncWebServerRequest *request) {
      StaticJsonDocument<200> response;
      response["status"] = "ok";
      response["uptime"] = millis();
      response["freeHeap"] = ESP.getFreeHeap();
      response["version"] = "1.0.0";
      
      String jsonString;
      serializeJson(response, jsonString);
      request->send(200, "application/json", jsonString);
    });

    // Tile update endpoint with ownership verification
    server.on("/api/tile/update", HTTP_POST, [this](AsyncWebServerRequest *request) {
      // Handle tile update with backend verification
      this->handleTileUpdate(request);
    });

    // Batch tile update endpoint
    server.on("/api/tiles/batch", HTTP_POST, [this](AsyncWebServerRequest *request) {
      this->handleBatchUpdate(request);
    });

    // System status endpoint
    server.on("/api/status", HTTP_GET, [this](AsyncWebServerRequest *request) {
      this->handleStatusRequest(request);
    });
  }

  void handleTileUpdate(AsyncWebServerRequest *request) {
    if (!request->hasParam("body", true)) {
      request->send(400, "application/json", "{\"error\":\"Missing request body\"}");
      return;
    }

    String body = request->getParam("body", true)->value();
    StaticJsonDocument<200> doc;
    
    if (deserializeJson(doc, body) != DeserializationError::Ok) {
      request->send(400, "application/json", "{\"error\":\"Invalid JSON\"}");
      return;
    }

    int tileId = doc["tile"];
    String colorHex = doc["color"];
    
    if (tileId < 0 || tileId >= numLeds) {
      request->send(400, "application/json", "{\"error\":\"Invalid tile ID\"}");
      return;
    }

    // Optional: Verify with backend before applying
    if (verifyWithBackend(tileId, colorHex)) {
      CRGB color = hexToRGB(colorHex);
      leds[tileId] = color;
      FastLED.show();
      
      StaticJsonDocument<100> response;
      response["success"] = true;
      response["tile"] = tileId;
      response["color"] = colorHex;
      
      String jsonResponse;
      serializeJson(response, jsonResponse);
      request->send(200, "application/json", jsonResponse);
    } else {
      request->send(403, "application/json", "{\"error\":\"Ownership verification failed\"}");
    }
  }

  bool verifyWithBackend(int tileId, String color) {
    if (backendUrl.isEmpty()) return true; // Skip verification if no backend
    
    HTTPClient http;
    http.begin(backendUrl + "/api/verify-tile/" + String(tileId));
    http.addHeader("Content-Type", "application/json");
    http.addHeader("Authorization", "Bearer " + apiKey);
    
    StaticJsonDocument<100> payload;
    payload["tile"] = tileId;
    payload["color"] = color;
    
    String payloadString;
    serializeJson(payload, payloadString);
    
    int httpResponseCode = http.POST(payloadString);
    bool verified = (httpResponseCode == 200);
    
    http.end();
    return verified;
  }

  CRGB hexToRGB(String hex) {
    // Convert hex color string to CRGB
    hex.replace("#", "");
    long number = strtol(hex.c_str(), NULL, 16);
    return CRGB((number >> 16) & 0xFF, (number >> 8) & 0xFF, number & 0xFF);
  }

  void handleStatusRequest(AsyncWebServerRequest *request) {
    StaticJsonDocument<300> status;
    status["wifi"]["connected"] = WiFi.status() == WL_CONNECTED;
    status["wifi"]["rssi"] = WiFi.RSSI();
    status["system"]["uptime"] = millis();
    status["system"]["freeHeap"] = ESP.getFreeHeap();
    status["led"]["count"] = numLeds;
    status["backend"]["url"] = backendUrl;
    
    String jsonString;
    serializeJson(status, jsonString);
    request->send(200, "application/json", jsonString);
  }
};
```

## Integration Testing Strategy

### 1. Unit Tests
- Backend ownership verification
- ESP32 endpoint responses
- Color conversion utilities

### 2. Integration Tests
- End-to-end workflow testing
- NFT ownership → backend verification → ESP32 update
- Error handling and retry mechanisms

### 3. Load Testing
- Multiple simultaneous tile updates
- Network latency handling
- Power management under load

### 4. Security Testing
- Authentication token validation
- Request rate limiting
- Malicious payload handling

## Deployment Configuration

### Backend Environment Variables
```bash
ESP32_HOST=192.168.1.100
ESP32_PORT=80
ESP32_API_KEY=your_esp32_api_key
BLOCKCHAIN_RPC_URL=your_ethereum_node
CONTRACT_ADDRESS=your_nft_contract_address
```

### ESP32 Configuration
```cpp
// config.h
#define WIFI_SSID "your_wifi_network"
#define WIFI_PASSWORD "your_wifi_password"
#define LED_PIN 5
#define NUM_LEDS 64
#define BACKEND_URL "http://your-backend.com"
#define API_KEY "your_api_key"
```

## Error Handling & Recovery

### Network Disconnection
- Automatic WiFi reconnection
- Queued updates during offline periods
- Status LED indicators

### Backend Unavailable
- Local caching of last known state
- Graceful degradation mode
- Retry mechanisms with exponential backoff

### Hardware Failures
- LED strip health monitoring
- Power supply status checks
- Temperature monitoring