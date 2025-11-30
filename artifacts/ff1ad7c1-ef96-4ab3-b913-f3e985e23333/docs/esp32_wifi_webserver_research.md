# ESP32 WiFi and Web Server Implementation Research

## WiFi Management Libraries

### WiFiManager vs ESPAsyncWebServer WiFi Manager

**WiFiManager Library:**
- Provides automatic WiFi provisioning without hard-coding credentials
- Creates access point when unable to connect to saved network
- Default AP name: "ESP-WIFI-MANAGER"
- Configuration web interface at 192.168.4.1
- Saves credentials to files: ssid.txt, pass.txt, ip.txt, gateway.txt

**ESPAsyncWebServer WiFi Manager (Custom Implementation):**
- More flexible than WiFiManager library
- Uses ESPAsyncWebServer for better performance
- Stores credentials in filesystem (LittleFS)
- Custom HTML forms for configuration
- Better integration with existing web servers

### Key Implementation Patterns

**Basic WiFi Connection:**
```cpp
#include <WiFi.h>

void setup() {
  WiFi.begin("SSID", "password");
  while (WiFi.status() != WL_CONNECTED) {
    delay(1000);
  }
}
```

**WiFiManager Pattern:**
1. Try to read saved credentials from filesystem
2. If empty or connection fails, create Access Point
3. Serve configuration web page
4. Save new credentials and restart
5. Connect in station mode with saved credentials

## ESP32WebServer Library

### Core Components
- `ESP32WebServer server(80)` - Creates server instance
- `server.on("/path", handler)` - Define route handlers
- `server.handleClient()` - Must be called in loop()
- `server.send(code, type, content)` - Send responses

### REST API Implementation Patterns

**GET Endpoint:**
```cpp
server.on("/api/status", HTTP_GET, [](){
  server.send(200, "application/json", "{\"status\":\"ok\"}");
});
```

**POST Endpoint with JSON:**
```cpp
server.on("/api/data", HTTP_POST, [](){
  String body = server.arg("plain");
  // Parse JSON here
  server.send(200, "application/json", "{\"result\":\"success\"}");
});
```

**CORS Headers for API:**
```cpp
server.sendHeader("Access-Control-Allow-Origin", "*");
server.sendHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE");
server.sendHeader("Access-Control-Allow-Headers", "Content-Type");
```

## JSON Parsing with ArduinoJson

### Library Installation
- Install `ArduinoJson` library (by Benoit Blanchon)
- Use `Arduino_JSON` for alternative implementation

### Core Usage Patterns

**Deserializing JSON (Parsing):**
```cpp
#include <ArduinoJson.h>

DynamicJsonDocument doc(1024);
deserializeJson(doc, jsonString);

// Access values
int value = doc["key"];
const char* text = doc["text"];
```

**Serializing JSON (Creating):**
```cpp
DynamicJsonDocument doc(1024);
doc["temperature"] = 25.6;
doc["humidity"] = 60;

String output;
serializeJson(doc, output);
```

### HTTP Client JSON Integration

**Receiving JSON from HTTP Response:**
```cpp
// Use HTTP 1.0 to avoid chunked encoding issues
http.useHTTP10(true);
http.begin(client, url);
http.GET();

DynamicJsonDocument doc(2048);
deserializeJson(doc, http.getStream());

// Access parsed data
float temp = doc["temperature"];
```

**Sending JSON in HTTP POST:**
```cpp
DynamicJsonDocument doc(2048);
doc["sensor"] = "temperature";
doc["value"] = 25.6;

String jsonString;
serializeJson(doc, jsonString);

http.begin(client, url);
http.addHeader("Content-Type", "application/json");
http.POST(jsonString);
```

## Best Practices for LED Board Project

### WiFi Management Strategy
1. Use ESPAsyncWebServer-based WiFi manager for better performance
2. Store credentials in LittleFS filesystem
3. Implement fallback to AP mode if connection fails
4. Add status LEDs to indicate WiFi connection state

### REST API Design
**Essential Endpoints:**
- `GET /api/status` - System health check
- `POST /api/tile/color` - Update single tile
- `POST /api/tiles/batch-update` - Update multiple tiles
- `GET /api/config` - Get current configuration
- `POST /api/config` - Update configuration

**JSON Payload Structure:**
```json
{
  "tile": {"x": 0, "y": 0},
  "color": {"r": 255, "g": 0, "b": 0},
  "brightness": 128
}
```

### Error Handling
- Validate JSON structure before processing
- Return appropriate HTTP status codes
- Implement retry logic for network operations
- Add watchdog timer for system recovery

### Performance Considerations
- Use static JSON documents when size is predictable
- Pre-allocate buffers for better memory management
- Handle CORS properly for web dashboard integration
- Implement request throttling to prevent overload