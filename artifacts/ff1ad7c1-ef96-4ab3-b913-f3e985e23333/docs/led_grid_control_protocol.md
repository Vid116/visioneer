# LED Grid Control Protocol Design

## REST API Endpoints

### Core Control Endpoints

#### 1. Individual Pixel Control
**Endpoint:** `POST /api/pixel`
**Purpose:** Set color for a single LED pixel
**Request Body:**
```json
{
  "x": 0,
  "y": 0,
  "color": {
    "r": 255,
    "g": 128,
    "b": 64
  },
  "brightness": 255
}
```
**Response:**
```json
{
  "status": "success",
  "pixel": {"x": 0, "y": 0},
  "applied_color": {"r": 255, "g": 128, "b": 64},
  "brightness": 255
}
```

#### 2. Batch Pixel Updates
**Endpoint:** `POST /api/pixels/batch`
**Purpose:** Update multiple pixels in a single request
**Request Body:**
```json
{
  "pixels": [
    {
      "x": 0, "y": 0,
      "color": {"r": 255, "g": 0, "b": 0}
    },
    {
      "x": 1, "y": 0,
      "color": {"r": 0, "g": 255, "b": 0}
    }
  ],
  "brightness": 200
}
```

#### 3. Pattern/Shape Control
**Endpoint:** `POST /api/pattern`
**Purpose:** Apply predefined patterns or shapes
**Request Body:**
```json
{
  "type": "rectangle",
  "start": {"x": 0, "y": 0},
  "end": {"x": 7, "y": 7},
  "color": {"r": 255, "g": 255, "b": 255},
  "fill": true,
  "brightness": 180
}
```

#### 4. Grid State Management
**Endpoint:** `GET /api/grid/state`
**Purpose:** Retrieve current grid state
**Response:**
```json
{
  "grid_size": {"width": 16, "height": 16},
  "total_pixels": 256,
  "active_pixels": 45,
  "global_brightness": 200,
  "pixels": [
    {"x": 0, "y": 0, "color": {"r": 255, "g": 0, "b": 0}},
    {"x": 1, "y": 0, "color": {"r": 0, "g": 255, "b": 0}}
  ]
}
```

#### 5. Grid Control Commands
**Endpoints:**
- `POST /api/grid/clear` - Clear all pixels (set to black)
- `POST /api/grid/fill` - Fill entire grid with single color
- `POST /api/grid/brightness` - Set global brightness
- `POST /api/grid/test` - Run test pattern

### Blockchain Integration Endpoints

#### 6. NFT Color Mapping
**Endpoint:** `POST /api/nft/color-map`
**Purpose:** Map NFT data to grid colors
**Request Body:**
```json
{
  "nft_id": "0x123...abc",
  "contract_address": "0x456...def",
  "attributes": {
    "trait_type": "background",
    "value": "blue"
  },
  "grid_region": {
    "start": {"x": 0, "y": 0},
    "end": {"x": 7, "y": 7}
  }
}
```

#### 7. Blockchain Event Response
**Endpoint:** `POST /api/blockchain/event`
**Purpose:** Trigger LED response to blockchain events
**Request Body:**
```json
{
  "event_type": "transfer",
  "token_id": "123",
  "from": "0x111...111",
  "to": "0x222...222",
  "animation": "pulse",
  "duration": 3000,
  "color": {"r": 0, "g": 255, "b": 255}
}
```

## Data Structures for ESP32 Firmware

### 1. Core Grid Structure
```cpp
struct GridConfig {
    uint8_t width;
    uint8_t height;
    uint16_t total_pixels;
    uint8_t global_brightness;
    bool dirty_flag;  // Indicates if grid needs refresh
};

struct PixelCoordinate {
    uint8_t x;
    uint8_t y;
};

struct RGBColor {
    uint8_t r;
    uint8_t g;
    uint8_t b;
    
    // Constructor for easy initialization
    RGBColor(uint8_t red = 0, uint8_t green = 0, uint8_t blue = 0)
        : r(red), g(green), b(blue) {}
};
```

### 2. Pixel Management
```cpp
class LEDMatrix {
private:
    CRGB* leds;                    // FastLED array
    RGBColor* pixel_buffer;        // Double buffer for smooth updates
    GridConfig config;
    bool* dirty_pixels;            // Track which pixels need updating
    
public:
    // Core operations
    void setPixel(uint8_t x, uint8_t y, RGBColor color);
    void setPixels(PixelUpdate* updates, size_t count);
    RGBColor getPixel(uint8_t x, uint8_t y);
    void clear();
    void fill(RGBColor color);
    void setBrightness(uint8_t brightness);
    void show();
    
    // Coordinate conversion
    uint16_t coordToIndex(uint8_t x, uint8_t y);
    PixelCoordinate indexToCoord(uint16_t index);
};
```

### 3. Memory-Efficient Update Structures
```cpp
struct PixelUpdate {
    PixelCoordinate coord;
    RGBColor color;
    uint8_t brightness;  // Optional per-pixel brightness
};

struct BatchUpdate {
    PixelUpdate* updates;
    size_t count;
    uint8_t global_brightness;
    bool immediate_show;  // Apply immediately or buffer
};

// Circular buffer for queued updates
class UpdateQueue {
private:
    PixelUpdate* queue;
    size_t capacity;
    size_t head;
    size_t tail;
    size_t size;
    
public:
    bool push(const PixelUpdate& update);
    bool pop(PixelUpdate& update);
    bool isEmpty();
    bool isFull();
    void clear();
};
```

### 4. Pattern and Animation Support
```cpp
enum PatternType {
    SOLID_COLOR,
    GRADIENT,
    RAINBOW,
    PULSE,
    WAVE,
    CUSTOM
};

struct Pattern {
    PatternType type;
    RGBColor primary_color;
    RGBColor secondary_color;
    uint16_t duration_ms;
    uint8_t speed;
    bool loop;
};

class PatternEngine {
private:
    Pattern current_pattern;
    uint32_t start_time;
    uint8_t animation_frame;
    
public:
    void setPattern(const Pattern& pattern);
    void updateAnimation();
    bool isComplete();
    void stop();
};
```

### 5. Blockchain Integration Data
```cpp
struct NFTMapping {
    char contract_address[43];  // 0x + 40 hex chars + null
    uint32_t token_id;
    PixelCoordinate start_coord;
    PixelCoordinate end_coord;
    RGBColor mapped_color;
    uint32_t last_update;
};

class BlockchainHandler {
private:
    NFTMapping* nft_mappings;
    size_t mapping_count;
    size_t mapping_capacity;
    
public:
    bool addNFTMapping(const NFTMapping& mapping);
    bool updateNFTColor(const char* contract, uint32_t token_id, RGBColor color);
    void processBlockchainEvent(const char* event_json);
    void cleanupExpiredMappings();
};
```

### 6. Memory Management Considerations
```cpp
class MemoryManager {
private:
    // Memory pools for different object types
    static const size_t PIXEL_UPDATE_POOL_SIZE = 100;
    static const size_t NFT_MAPPING_POOL_SIZE = 50;
    
    PixelUpdate pixel_update_pool[PIXEL_UPDATE_POOL_SIZE];
    bool pixel_update_used[PIXEL_UPDATE_POOL_SIZE];
    
    NFTMapping nft_mapping_pool[NFT_MAPPING_POOL_SIZE];
    bool nft_mapping_used[NFT_MAPPING_POOL_SIZE];
    
public:
    PixelUpdate* allocatePixelUpdate();
    void freePixelUpdate(PixelUpdate* update);
    NFTMapping* allocateNFTMapping();
    void freeNFTMapping(NFTMapping* mapping);
    
    // Memory usage statistics
    size_t getUsedPixelUpdates();
    size_t getUsedNFTMappings();
    size_t getFreeRAM();
};
```

## Protocol Features

### Error Handling
- Standardized HTTP status codes (200, 400, 404, 500)
- Detailed error messages in JSON format
- Input validation for coordinates, colors, and parameters
- Graceful degradation for memory constraints

### Performance Optimizations
- Batch updates to minimize HTTP requests
- Double buffering for smooth animations
- Dirty pixel tracking to reduce unnecessary updates
- Memory pooling to prevent fragmentation
- Asynchronous processing for blockchain events

### Security Considerations
- Input validation and sanitization
- Rate limiting for API endpoints
- Authentication tokens for sensitive operations
- CORS configuration for web dashboard access

### Scalability Features
- Dynamic memory allocation based on grid size
- Configurable update queue sizes
- Pattern compression for complex animations
- Modular architecture for easy extension