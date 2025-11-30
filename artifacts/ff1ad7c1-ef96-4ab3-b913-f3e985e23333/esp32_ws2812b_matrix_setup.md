# ESP32 FastLED Library Setup for WS2812B 8x8 Matrix

## Hardware Requirements

### ESP32 Board
- ESP32 development board (recommended for high LED count support)
- Clock speed: 160-240 MHz
- RAM capacity: Can handle up to 97,000 LEDs theoretically
- For 64 LEDs (8x8 matrix): ~192 bytes RAM (3 bytes per LED)

### WS2812B LED Matrix
- 8x8 matrix = 64 individually addressable LEDs
- Operating voltage: 5V DC
- Current draw per LED: 50-60mA at full white brightness
- Total max current for 64 LEDs: ~3.2-3.8A at full brightness

## Power Supply Requirements

### Power Calculations
- Each WS2812B LED draws ~50-60mA at full brightness white
- 64 LEDs × 60mA = 3.84A maximum current draw
- Recommended supply: 5V, 4-5A capacity
- Power consumption: ~20W at full brightness

### Power Supply Options
- 5V 4A switching power supply (minimum)
- 5V 5A or higher recommended for headroom
- External power supply required (Arduino/ESP32 cannot supply this current)

## Wiring Configuration

### Basic Connections
```
ESP32 Pin    → WS2812B Matrix
GPIO 4       → Data In (DI)
GND          → Ground
5V (VIN)     → 5V (from external supply)
```

### Recommended Pin Assignments
- **Data Pin**: GPIO 4 (commonly used, but any digital pin works)
- **Alternative pins**: GPIO 2, 5, 16, 17, 18, 19, 21, 22, 23

### Additional Components
- **330Ω resistor** between ESP32 data pin and LED data input (reduces noise)
- **470-1000μF capacitor** between 5V and GND near LED matrix (power filtering)
- **Level shifter** (optional but recommended for reliability)

## Level Shifter Considerations

### 3.3V to 5V Logic Level Issue
- ESP32 outputs 3.3V logic levels
- WS2812B requires 5V logic levels
- Many setups work without level shifter, but reliability varies

### When Level Shifter is Needed
- Long wire runs
- Large LED matrices
- Noisy electrical environment
- Production/commercial applications

### Level Shifter Options
1. **74HCT14** or **74HCT04** (recommended)
2. **SN74AHCT125** (quad buffer)
3. **Bi-directional level shifter modules** (not ideal for high-speed WS2812B)

## FastLED Library Configuration

### Library Installation
1. Arduino IDE: Tools → Manage Libraries → Search "FastLED"
2. Install FastLED by Daniel Garcia
3. Include in code: `#include <FastLED.h>`

### Basic Code Structure
```cpp
#include <FastLED.h>

#define DATA_PIN 4
#define NUM_LEDS 64
#define BRIGHTNESS 50  // 0-255, keep low for testing
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB

CRGB leds[NUM_LEDS];

void setup() {
  FastLED.addLeds<LED_TYPE, DATA_PIN, COLOR_ORDER>(leds, NUM_LEDS);
  FastLED.setBrightness(BRIGHTNESS);
}

void loop() {
  // Set colors and update display
  FastLED.show();
  delay(100);
}
```

## Matrix Addressing

### Linear vs XY Coordinate Mapping
- WS2812B strips are linear (0 to NUM_LEDS-1)
- 8x8 matrix requires coordinate conversion
- Different matrices have different wiring patterns (zigzag vs parallel)

### Common Matrix Patterns
1. **Zigzag/Serpentine**: Data flows back and forth
2. **Parallel**: Each row starts from the same side

### XY Coordinate Function (Zigzag pattern)
```cpp
uint16_t XY(uint8_t x, uint8_t y) {
  uint16_t i;
  if(y & 0x01) {
    // Odd rows run backwards
    uint8_t reverseX = (8-1) - x;
    i = (y * 8) + reverseX;
  } else {
    // Even rows run forwards
    i = (y * 8) + x;
  }
  return i;
}
```

## Safety and Best Practices

### Power Management
- Start with low brightness (10-20%) for testing
- Use external power supply for anything over 30 LEDs
- Connect power supply ground to ESP32 ground
- Add fuse protection on power lines

### Thermal Considerations
- WS2812B LEDs generate heat at high brightness
- Consider heat dissipation for enclosed projects
- Monitor temperature during extended operation

### Code Best Practices
- Use `FastLED.clear()` before setting new patterns
- Call `FastLED.show()` only when needed (not every loop)
- Implement brightness limiting in code
- Add delays between rapid color changes

## Troubleshooting

### Common Issues
1. **No LED response**: Check power supply, data pin connection
2. **First LED not working**: May need level shifter
3. **Erratic colors**: Check ground connections, add capacitor
4. **LEDs stop working partway**: Insufficient power supply
5. **Overheating**: Reduce brightness, improve ventilation

### Testing Steps
1. Test with single LED first
2. Gradually increase LED count
3. Monitor current consumption
4. Test at different brightness levels
5. Verify matrix coordinate mapping

## Performance Considerations

### Memory Usage
- Each LED uses 3 bytes of RAM (RGB values)
- 64 LEDs = 192 bytes
- ESP32 has plenty of RAM for this application

### Update Rate
- FastLED can achieve 400+ fps with WS2812B
- Practical update rates: 30-100 fps depending on complexity
- Higher update rates may cause power supply stress

### Animation Optimization
- Pre-calculate color palettes
- Use FastLED's built-in math functions
- Minimize floating-point operations in loops