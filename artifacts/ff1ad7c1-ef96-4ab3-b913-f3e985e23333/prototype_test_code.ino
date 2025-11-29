/*
 * LED Advertising Board Prototype - Integration Test Code
 * ESP32 + WS2812B Matrix + Blockchain API Integration
 * 
 * This code demonstrates the complete pipeline from NFT data to LED display
 */

#include <WiFi.h>
#include <HTTPClient.h>
#include <ArduinoJson.h>
#include <FastLED.h>
#include <WebServer.h>
#include <EEPROM.h>

// Hardware Configuration
#define LED_PIN 2
#define LED_COUNT 64  // 8x8 matrix for prototype
#define MATRIX_WIDTH 8
#define MATRIX_HEIGHT 8
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
#define BRIGHTNESS 100

// Network Configuration
#define EEPROM_SIZE 512
#define SSID_ADDR 0
#define PASS_ADDR 100
#define API_POLL_INTERVAL 30000  // 30 seconds

// LED Array
CRGB leds[LED_COUNT];

// Web Server
WebServer server(80);

// Global Variables
String wifi_ssid = "";
String wifi_password = "";
unsigned long lastAPICall = 0;
bool systemInitialized = false;
int connectionRetries = 0;
const int maxRetries = 5;

// Test NFT Collection (CryptoPunks for demo)
const String NFT_CONTRACT = "0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB";
const String API_BASE = "https://api.opensea.io/api/v1";

// Color mapping variables
float currentHue = 0.0;
uint8_t currentSaturation = 255;
uint8_t currentValue = 255;

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("LED Advertising Board Prototype Starting...");
  
  // Initialize EEPROM
  EEPROM.begin(EEPROM_SIZE);
  
  // Initialize LED Matrix
  FastLED.addLeds<LED_TYPE, LED_PIN, COLOR_ORDER>(leds, LED_COUNT);
  FastLED.setBrightness(BRIGHTNESS);
  FastLED.clear();
  FastLED.show();
  
  // Show startup pattern
  showStartupPattern();
  
  // Load WiFi credentials
  loadWiFiCredentials();
  
  // Setup web server for configuration
  setupWebServer();
  
  // Attempt WiFi connection
  if (connectToWiFi()) {
    systemInitialized = true;
    showSuccessPattern();
    Serial.println("System initialized successfully");
  } else {
    showErrorPattern();
    Serial.println("Failed to initialize - entering config mode");
  }
}

void loop() {
  // Handle web server requests
  server.handleClient();
  
  if (systemInitialized && WiFi.status() == WL_CONNECTED) {
    // Check if it's time for API call
    if (millis() - lastAPICall > API_POLL_INTERVAL) {
      fetchNFTData();
      lastAPICall = millis();
    }
    
    // Update LED display with current data
    updateLEDDisplay();
    
  } else if (WiFi.status() != WL_CONNECTED) {
    // Handle WiFi disconnection
    handleWiFiDisconnection();
  }
  
  delay(100);  // Small delay for system stability
}

void showStartupPattern() {
  // Rainbow sweep during startup
  for (int i = 0; i < LED_COUNT; i++) {
    leds[i] = CHSV(i * 255 / LED_COUNT, 255, 255);
    FastLED.show();
    delay(50);
  }
  delay(500);
  FastLED.clear();
  FastLED.show();
}

void showSuccessPattern() {
  // Green checkmark pattern
  fill_solid(leds, LED_COUNT, CRGB::Green);
  FastLED.show();
  delay(1000);
  FastLED.clear();
  FastLED.show();
}

void showErrorPattern() {
  // Red X pattern
  for (int i = 0; i < 3; i++) {
    fill_solid(leds, LED_COUNT, CRGB::Red);
    FastLED.show();
    delay(300);
    FastLED.clear();
    FastLED.show();
    delay(300);
  }
}

bool connectToWiFi() {
  if (wifi_ssid.length() == 0) {
    Serial.println("No WiFi credentials found");
    return false;
  }
  
  WiFi.begin(wifi_ssid.c_str(), wifi_password.c_str());
  Serial.print("Connecting to WiFi");
  
  connectionRetries = 0;
  while (WiFi.status() != WL_CONNECTED && connectionRetries < maxRetries) {
    delay(1000);
    Serial.print(".");
    connectionRetries++;
    
    // Show connection attempt on LEDs
    leds[connectionRetries - 1] = CRGB::Yellow;
    FastLED.show();
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi connected!");
    Serial.print("IP address: ");
    Serial.println(WiFi.localIP());
    return true;
  } else {
    Serial.println();
    Serial.println("WiFi connection failed");
    return false;
  }
}

void handleWiFiDisconnection() {
  Serial.println("WiFi disconnected - attempting reconnection");
  systemInitialized = false;
  
  if (connectToWiFi()) {
    systemInitialized = true;
    showSuccessPattern();
  } else {
    showErrorPattern();
  }
}

void fetchNFTData() {
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("No WiFi connection for API call");
    return;
  }
  
  HTTPClient http;
  http.begin(API_BASE + "/collection/" + NFT_CONTRACT.substring(2) + "/stats");
  http.addHeader("Accept", "application/json");
  
  Serial.println("Fetching NFT collection data...");
  
  int httpResponseCode = http.GET();
  
  if (httpResponseCode == 200) {
    String payload = http.getString();
    parseNFTData(payload);
    Serial.println("NFT data updated successfully");
    
    // Brief success indicator
    leds[0] = CRGB::Blue;
    FastLED.show();
    delay(100);
    leds[0] = CRGB::Black;
    
  } else {
    Serial.printf("HTTP Error: %d\n", httpResponseCode);
    showAPIErrorPattern();
  }
  
  http.end();
}

void parseNFTData(String jsonData) {
  DynamicJsonDocument doc(2048);
  deserializeJson(doc, jsonData);
  
  if (doc["stats"]) {
    // Extract relevant metrics
    float floorPrice = doc["stats"]["floor_price"];
    float totalVolume = doc["stats"]["total_volume"];
    int totalSupply = doc["stats"]["total_supply"];
    
    // Map floor price to hue (0-360 degrees)
    // Assuming floor price range 0-100 ETH maps to full color spectrum
    currentHue = constrain(floorPrice * 3.6, 0, 360);
    
    // Map volume to saturation
    currentSaturation = constrain(totalVolume / 1000 * 255, 0, 255);
    
    // Keep brightness constant for now
    currentValue = 200;
    
    Serial.printf("Floor Price: %.2f ETH -> Hue: %.1f\n", floorPrice, currentHue);
    Serial.printf("Total Volume: %.2f ETH -> Saturation: %d\n", totalVolume, currentSaturation);
  }
}

void updateLEDDisplay() {
  // Create color from HSV values
  CRGB color = CHSV(currentHue, currentSaturation, currentValue);
  
  // Fill matrix with base color
  fill_solid(leds, LED_COUNT, color);
  
  // Add subtle animation based on time
  uint8_t wave = sin8(millis() / 100);
  for (int i = 0; i < LED_COUNT; i++) {
    leds[i].fadeToBlackBy(wave / 4);
  }
  
  FastLED.show();
}

void showAPIErrorPattern() {
  // Orange warning pattern
  for (int i = 0; i < 2; i++) {
    fill_solid(leds, LED_COUNT, CRGB::Orange);
    FastLED.show();
    delay(200);
    FastLED.clear();
    FastLED.show();
    delay(200);
  }
}

void setupWebServer() {
  // Configuration page
  server.on("/", handleConfigPage);
  server.on("/config", HTTP_POST, handleConfigSubmit);
  server.on("/status", handleStatusPage);
  
  server.begin();
  Serial.println("Web server started");
}

void handleConfigPage() {
  String html = "<!DOCTYPE html><html><head><title>LED Board Config</title></head><body>";
  html += "<h1>LED Advertising Board Configuration</h1>";
  html += "<form action='/config' method='POST'>";
  html += "WiFi SSID: <input type='text' name='ssid' value='" + wifi_ssid + "'><br><br>";
  html += "WiFi Password: <input type='password' name='password'><br><br>";
  html += "<input type='submit' value='Save Configuration'>";
  html += "</form>";
  html += "<br><a href='/status'>System Status</a>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void handleConfigSubmit() {
  wifi_ssid = server.arg("ssid");
  wifi_password = server.arg("password");
  
  saveWiFiCredentials();
  
  server.send(200, "text/html", 
    "<html><body><h1>Configuration Saved</h1>"
    "<p>Restarting system...</p></body></html>");
  
  delay(2000);
  ESP.restart();
}

void handleStatusPage() {
  String html = "<!DOCTYPE html><html><head><title>System Status</title></head><body>";
  html += "<h1>System Status</h1>";
  html += "<p>WiFi Status: " + String(WiFi.status() == WL_CONNECTED ? "Connected" : "Disconnected") + "</p>";
  html += "<p>IP Address: " + WiFi.localIP().toString() + "</p>";
  html += "<p>System Initialized: " + String(systemInitialized ? "Yes" : "No") + "</p>";
  html += "<p>Current Hue: " + String(currentHue) + "</p>";
  html += "<p>Current Saturation: " + String(currentSaturation) + "</p>";
  html += "<p>Last API Call: " + String((millis() - lastAPICall) / 1000) + " seconds ago</p>";
  html += "<br><a href='/'>Configuration</a>";
  html += "</body></html>";
  
  server.send(200, "text/html", html);
}

void loadWiFiCredentials() {
  wifi_ssid = readStringFromEEPROM(SSID_ADDR);
  wifi_password = readStringFromEEPROM(PASS_ADDR);
}

void saveWiFiCredentials() {
  writeStringToEEPROM(SSID_ADDR, wifi_ssid);
  writeStringToEEPROM(PASS_ADDR, wifi_password);
  EEPROM.commit();
}

String readStringFromEEPROM(int addr) {
  String data = "";
  char c;
  for (int i = addr; i < addr + 50; i++) {
    c = EEPROM.read(i);
    if (c == 0) break;
    data += c;
  }
  return data;
}

void writeStringToEEPROM(int addr, String data) {
  for (int i = 0; i < data.length() && i < 50; i++) {
    EEPROM.write(addr + i, data[i]);
  }
  EEPROM.write(addr + data.length(), 0);  // Null terminator
}

// Matrix coordinate conversion helper
int getPixelIndex(int x, int y) {
  // Convert x,y coordinates to linear LED index
  // Assumes serpentine wiring pattern
  if (y % 2 == 0) {
    return y * MATRIX_WIDTH + x;
  } else {
    return y * MATRIX_WIDTH + (MATRIX_WIDTH - 1 - x);
  }
}

// Test function for manual LED testing
void testLEDMatrix() {
  // Red, Green, Blue test
  fill_solid(leds, LED_COUNT, CRGB::Red);
  FastLED.show();
  delay(1000);
  
  fill_solid(leds, LED_COUNT, CRGB::Green);
  FastLED.show();
  delay(1000);
  
  fill_solid(leds, LED_COUNT, CRGB::Blue);
  FastLED.show();
  delay(1000);
  
  FastLED.clear();
  FastLED.show();
}