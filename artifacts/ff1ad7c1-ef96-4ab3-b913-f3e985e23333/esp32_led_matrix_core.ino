/*
 * ESP32 LED Matrix Core Firmware
 * Blockchain-responsive LED advertising board with WS2812B matrix
 * 
 * Features:
 * - WiFi connection management with auto-reconnect
 * - FastLED integration for WS2812B matrix control
 * - Grid-based coordinate system for tile addressing
 * - Color setting functions with brightness control
 * - Modular architecture ready for REST API integration
 * 
 * Hardware:
 * - ESP32 DevKit V1 or similar
 * - WS2812B LED matrix (configurable size)
 * - External 5V power supply for large matrices
 * - 470ohm resistor between ESP32 data pin and LED strip
 * - 1000uF capacitor across power supply for stability
 */

#include <WiFi.h>
#include <FastLED.h>

// ===== CONFIGURATION =====
// WiFi credentials
const char* WIFI_SSID = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// LED Matrix Configuration
#define LED_PIN         2       // GPIO pin connected to WS2812B data line
#define LED_TYPE        WS2812B
#define COLOR_ORDER     GRB
#define MATRIX_WIDTH    8       // Number of tiles horizontally
#define MATRIX_HEIGHT   8       // Number of tiles vertically
#define NUM_LEDS        (MATRIX_WIDTH * MATRIX_HEIGHT)
#define BRIGHTNESS      128     // Global brightness (0-255)
#define FRAMES_PER_SECOND 60

// Power management
#define MAX_MILLIAMPS   2000    // Limit power draw for safety

// Matrix layout - adjust based on your wiring pattern
#define MATRIX_SERPENTINE true  // Set to false if matrix is not serpentine wired

// ===== GLOBAL VARIABLES =====
CRGB leds[NUM_LEDS];
bool wifiConnected = false;
unsigned long lastWiFiCheck = 0;
const unsigned long WIFI_CHECK_INTERVAL = 30000; // Check WiFi every 30 seconds

// ===== CORE FUNCTIONS =====

/**
 * Initialize WiFi connection
 * Connects to specified network with automatic retry
 */
void setupWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  
  Serial.print("Connecting to WiFi");
  int attempts = 0;
  while (WiFi.status() != WL_CONNECTED && attempts < 20) {
    delay(500);
    Serial.print(".");
    attempts++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    wifiConnected = true;
    Serial.println();
    Serial.println("WiFi connected successfully!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    Serial.print("Signal strength (RSSI): ");
    Serial.println(WiFi.RSSI());
  } else {
    wifiConnected = false;
    Serial.println();
    Serial.println("WiFi connection failed. Operating in offline mode.");
  }
}

/**
 * Check WiFi connection status and reconnect if needed
 */
void checkWiFiConnection() {
  if (millis() - lastWiFiCheck > WIFI_CHECK_INTERVAL) {
    lastWiFiCheck = millis();
    
    if (WiFi.status() != WL_CONNECTED && wifiConnected) {
      Serial.println("WiFi connection lost. Attempting to reconnect...");
      wifiConnected = false;
      WiFi.reconnect();
    } else if (WiFi.status() == WL_CONNECTED && !wifiConnected) {
      wifiConnected = true;
      Serial.println("WiFi reconnected successfully!");
      Serial.print("IP address: ");
      Serial.println(WiFi.localIP());
    }
  }
}

/**
 * Initialize LED matrix
 * Sets up FastLED library and applies power/thermal management
 */
void setupLEDs() {
  // Initialize FastLED
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, NUM_LEDS)
    .setCorrection(TypicalLEDStrip)
    .setTemperature(DirectSunlight);
  
  // Set brightness and power limits
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.setMaxPowerInVoltsAndMilliamps(5, MAX_MILLIAMPS);
  
  // Clear all LEDs on startup
  FastLED.clear();
  FastLED.show();
  
  Serial.println("LED matrix initialized");
  Serial.printf("Matrix size: %dx%d (%d LEDs)\n", MATRIX_WIDTH, MATRIX_HEIGHT, NUM_LEDS);
  Serial.printf("Power limit: %d mA\n", MAX_MILLIAMPS);
  
  // Test pattern - brief startup animation
  startupAnimation();
}

/**
 * Convert 2D grid coordinates to 1D LED index
 * Handles serpentine wiring pattern common in LED matrices
 * 
 * @param x Horizontal coordinate (0 to MATRIX_WIDTH-1)
 * @param y Vertical coordinate (0 to MATRIX_HEIGHT-1)
 * @return LED index in the strip, or -1 if coordinates are invalid
 */
int getPixelIndex(int x, int y) {
  // Boundary check
  if (x < 0 || x >= MATRIX_WIDTH || y < 0 || y >= MATRIX_HEIGHT) {
    return -1;
  }
  
  int index;
  
  if (MATRIX_SERPENTINE) {
    // Serpentine wiring: odd rows are reversed
    if (y % 2 == 0) {
      // Even rows: left to right
      index = y * MATRIX_WIDTH + x;
    } else {
      // Odd rows: right to left
      index = y * MATRIX_WIDTH + (MATRIX_WIDTH - 1 - x);
    }
  } else {
    // Non-serpentine: all rows left to right
    index = y * MATRIX_WIDTH + x;
  }
  
  return index;
}

/**
 * Set color of a specific tile/pixel
 * 
 * @param x Horizontal coordinate
 * @param y Vertical coordinate
 * @param color CRGB color object
 * @return true if pixel was set successfully, false if coordinates invalid
 */
bool setPixel(int x, int y, CRGB color) {
  int index = getPixelIndex(x, y);
  if (index >= 0 && index < NUM_LEDS) {
    leds[index] = color;
    return true;
  }
  return false;
}

/**
 * Set color of a specific tile using RGB values
 * 
 * @param x Horizontal coordinate
 * @param y Vertical coordinate
 * @param r Red value (0-255)
 * @param g Green value (0-255)
 * @param b Blue value (0-255)
 * @return true if pixel was set successfully
 */
bool setPixelRGB(int x, int y, uint8_t r, uint8_t g, uint8_t b) {
  return setPixel(x, y, CRGB(r, g, b));
}

/**
 * Set color of a specific tile using HSV values
 * 
 * @param x Horizontal coordinate
 * @param y Vertical coordinate
 * @param h Hue value (0-255)
 * @param s Saturation value (0-255)
 * @param v Value/brightness (0-255)
 * @return true if pixel was set successfully
 */
bool setPixelHSV(int x, int y, uint8_t h, uint8_t s, uint8_t v) {
  return setPixel(x, y, CHSV(h, s, v));
}

/**
 * Clear all pixels to black
 */
void clearMatrix() {
  FastLED.clear();
}

/**
 * Update the LED matrix display
 * Call this after setting pixel colors to make changes visible
 */
void updateDisplay() {
  FastLED.show();
}

/**
 * Set brightness of the entire matrix
 * 
 * @param brightness Brightness level (0-255)
 */
void setBrightness(uint8_t brightness) {
  FastLED.setBrightness(brightness);
}

/**
 * Fill entire matrix with a single color
 * 
 * @param color CRGB color to fill with
 */
void fillMatrix(CRGB color) {
  fill_solid(leds, NUM_LEDS, color);
}

/**
 * Fill a rectangular region with a color
 * 
 * @param x1 Start x coordinate
 * @param y1 Start y coordinate
 * @param x2 End x coordinate
 * @param y2 End y coordinate
 * @param color Fill color
 */
void fillRect(int x1, int y1, int x2, int y2, CRGB color) {
  for (int y = y1; y <= y2; y++) {
    for (int x = x1; x <= x2; x++) {
      setPixel(x, y, color);
    }
  }
}

/**
 * Startup animation to test the matrix
 * Brief rainbow sweep across the matrix
 */
void startupAnimation() {
  Serial.println("Running startup animation...");
  
  // Rainbow sweep
  for (int frame = 0; frame < MATRIX_WIDTH + MATRIX_HEIGHT; frame++) {
    clearMatrix();
    
    for (int y = 0; y < MATRIX_HEIGHT; y++) {
      for (int x = 0; x < MATRIX_WIDTH; x++) {
        if (x + y == frame) {
          uint8_t hue = map(frame, 0, MATRIX_WIDTH + MATRIX_HEIGHT - 1, 0, 255);
          setPixelHSV(x, y, hue, 255, 255);
        }
      }
    }
    
    updateDisplay();
    delay(100);
  }
  
  // Brief pause, then clear
  delay(500);
  clearMatrix();
  updateDisplay();
  
  Serial.println("Startup animation complete");
}

/**
 * Demo pattern for testing
 * Creates a moving rainbow wave
 */
void rainbowDemo() {
  static uint8_t hue_offset = 0;
  
  for (int y = 0; y < MATRIX_HEIGHT; y++) {
    for (int x = 0; x < MATRIX_WIDTH; x++) {
      uint8_t hue = hue_offset + (x * 256 / MATRIX_WIDTH) + (y * 256 / MATRIX_HEIGHT);
      setPixelHSV(x, y, hue, 255, 255);
    }
  }
  
  updateDisplay();
  hue_offset += 2;
  delay(50);
}

/**
 * System status indicator
 * Shows WiFi connection status on corner pixels
 */
void updateStatusIndicators() {
  // WiFi status indicator in top-left corner
  if (wifiConnected) {
    setPixelRGB(0, 0, 0, 255, 0); // Green for connected
  } else {
    setPixelRGB(0, 0, 255, 0, 0); // Red for disconnected
  }
  
  // System heartbeat in top-right corner
  static unsigned long lastBlink = 0;
  static bool blinkState = false;
  
  if (millis() - lastBlink > 1000) {
    lastBlink = millis();
    blinkState = !blinkState;
    
    if (blinkState) {
      setPixelRGB(MATRIX_WIDTH - 1, 0, 0, 0, 255); // Blue heartbeat
    } else {
      setPixelRGB(MATRIX_WIDTH - 1, 0, 0, 0, 0);   // Off
    }
  }
}

// ===== MAIN PROGRAM =====

void setup() {
  // Initialize serial communication
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("=================================");
  Serial.println("ESP32 LED Matrix Core Firmware");
  Serial.println("Blockchain-Responsive LED Board");
  Serial.println("=================================");
  
  // Initialize hardware
  setupLEDs();
  setupWiFi();
  
  Serial.println("System initialization complete");
  Serial.println("Entering main loop...");
  Serial.println();
}

void loop() {
  // Core system maintenance
  checkWiFiConnection();
  updateStatusIndicators();
  
  // Demo mode when not receiving external commands
  // This will be replaced by REST API handling in the next phase
  static unsigned long lastDemo = 0;
  if (millis() - lastDemo > 100) {
    lastDemo = millis();
    
    // Run rainbow demo
    // rainbowDemo();
    
    // For now, just update the display with status indicators
    updateDisplay();
  }
  
  // Small delay to prevent watchdog reset
  delay(10);
}

/**
 * Utility function to print matrix configuration
 * Useful for debugging coordinate mapping
 */
void printMatrixInfo() {
  Serial.println("Matrix Configuration:");
  Serial.printf("  Size: %dx%d pixels\n", MATRIX_WIDTH, MATRIX_HEIGHT);
  Serial.printf("  Total LEDs: %d\n", NUM_LEDS);
  Serial.printf("  Serpentine: %s\n", MATRIX_SERPENTINE ? "Yes" : "No");
  Serial.printf("  LED Type: WS2812B\n");
  Serial.printf("  Data Pin: GPIO%d\n", LED_PIN);
  Serial.printf("  Max Power: %d mA\n", MAX_MILLIAMPS);
  Serial.println();
  
  // Print coordinate mapping for first few pixels
  Serial.println("Coordinate Mapping (first 16 pixels):");
  for (int y = 0; y < min(4, MATRIX_HEIGHT); y++) {
    for (int x = 0; x < min(4, MATRIX_WIDTH); x++) {
      int index = getPixelIndex(x, y);
      Serial.printf("(%d,%d)->%d  ", x, y, index);
    }
    Serial.println();
  }
  Serial.println();
}