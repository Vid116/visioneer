# LED Advertising Board Deployment Guide

## Table of Contents
1. [Pre-Deployment Checklist](#pre-deployment-checklist)
2. [Hardware Setup](#hardware-setup)
3. [Software Configuration](#software-configuration)
4. [Network Configuration](#network-configuration)
5. [Blockchain Connection Setup](#blockchain-connection-setup)
6. [System Integration Testing](#system-integration-testing)
7. [Production Deployment](#production-deployment)
8. [Post-Deployment Verification](#post-deployment-verification)

## Pre-Deployment Checklist

### Site Requirements
- [ ] Power requirements assessed (calculate total wattage for LED array)
- [ ] Ambient temperature within operating range (-20°C to 60°C)
- [ ] WiFi/Ethernet connectivity available and tested
- [ ] Physical mounting location accessible and secure
- [ ] Adequate ventilation for thermal management
- [ ] Protection from weather elements (for outdoor installations)

### Hardware Inventory
- [ ] ESP32/microcontroller boards (quantity as per grid size)
- [ ] WS2812B LED strips/panels (quantity for complete grid)
- [ ] Power supplies (5V, amperage calculated for full LED load)
- [ ] Network cables/WiFi adapters
- [ ] Mounting hardware and enclosures
- [ ] Cooling fans (if required for large installations)
- [ ] Backup/spare components (10% of critical components)

### Documentation and Tools
- [ ] Configuration files and parameter backup
- [ ] Installation diagrams and wiring schematics
- [ ] Network configuration details
- [ ] Blockchain API credentials and endpoints
- [ ] Installation tools and test equipment
- [ ] Digital multimeter and oscilloscope (for debugging)

## Hardware Setup

### Power System Installation

#### Power Calculations
```
Total Power = (Number of LEDs) × (Power per LED) × (Brightness Factor)
Example: 1000 LEDs × 0.06W × 0.8 = 48W minimum
Recommended: Add 25% safety margin = 60W power supply
```

#### Power Distribution
1. Install main 5V power supply with adequate amperage rating
2. Implement power distribution network:
   - Use 18-20 AWG wire for main power runs
   - Install fuses/circuit breakers for protection
   - Add power injection points every 100-150 LEDs
3. Ground all metal components and enclosures
4. Install surge protection devices

### LED Array Assembly

#### Physical Installation
1. Mount LED strips/panels according to grid layout design
2. Maintain consistent spacing between tiles
3. Secure all connections with proper strain relief
4. Route data cables away from power lines to minimize interference
5. Install in weatherproof enclosures for outdoor deployments

#### Electrical Connections
1. Connect data lines: ESP32 → LED strip data input
2. Connect power: Power supply → LED strip VCC/GND
3. Implement proper grounding throughout system
4. Add level shifters if using 3.3V controllers with 5V LEDs
5. Test continuity on all connections before powering on

### Controller Installation

#### ESP32 Setup
1. Flash firmware to ESP32 controllers
2. Configure unique device IDs for each controller
3. Set up WiFi credentials and network parameters
4. Install controllers in accessible locations for debugging
5. Provide adequate cooling for controllers

#### Network Infrastructure
1. Install WiFi access points with sufficient coverage
2. Configure network segmentation (VLANs) if required
3. Set up wired Ethernet backhaul for large deployments
4. Implement redundant network connections
5. Configure firewall rules for blockchain API access

## Software Configuration

### Firmware Configuration

#### Base Configuration (config.h)
```cpp
// Network Configuration
#define WIFI_SSID "LED_Board_Network"
#define WIFI_PASSWORD "secure_password"
#define STATIC_IP_ENABLED true
#define DEVICE_IP_BASE "192.168.1.100"

// LED Configuration  
#define LED_COUNT 256
#define LED_PIN 2
#define LED_TYPE WS2812B
#define COLOR_ORDER GRB
#define MAX_BRIGHTNESS 128

// Blockchain Configuration
#define BLOCKCHAIN_API_URL "https://api.ethereum.io/v1/"
#define NFT_CONTRACT_ADDRESS "0x..."
#define POLLING_INTERVAL_MS 5000
```

#### Device-Specific Configuration
1. Set unique device IDs for each controller
2. Configure LED count and pin assignments per controller
3. Set network addresses (static IPs recommended)
4. Configure blockchain monitoring parameters
5. Set failsafe colors and patterns

### Parameter Archiving

#### Configuration Backup Process
1. Create project configuration archive:
   ```
   ProjectName_Config_YYYYMMDD/
   ├── firmware/
   │   ├── main.bin
   │   ├── config.h
   │   └── version.txt
   ├── network/
   │   ├── wifi_config.json
   │   ├── ip_assignments.csv
   │   └── vlan_setup.txt
   ├── blockchain/
   │   ├── api_endpoints.json
   │   ├── contract_addresses.json
   │   └── nft_mappings.csv
   └── hardware/
       ├── led_layout.svg
       ├── power_distribution.pdf
       └── wiring_diagram.pdf
   ```

2. Version control all configuration files
3. Implement automated backup procedures
4. Store backups in multiple locations (local, cloud, offline)

## Network Configuration

### WiFi Setup for Small Deployments (< 50 tiles)

#### Access Point Configuration
1. Configure dedicated WiFi network for LED boards
2. Set appropriate channel (avoid interference)
3. Configure WPA2/WPA3 security
4. Set adequate DHCP pool size
5. Enable QoS for consistent performance

#### Device Network Settings
```json
{
  "network_config": {
    "ssid": "LED_Board_Network",
    "password": "secure_password",
    "encryption": "WPA2",
    "ip_mode": "static",
    "ip_base": "192.168.1.100",
    "subnet_mask": "255.255.255.0",
    "gateway": "192.168.1.1",
    "dns_primary": "8.8.8.8",
    "dns_secondary": "8.8.4.4"
  }
}
```

### Ethernet Setup for Medium/Large Deployments

#### Network Infrastructure Requirements
- Managed switches with VLAN support
- Gigabit Ethernet for backbone connections
- PoE+ switches for simplified power/data delivery
- Redundant uplink connections
- Network monitoring capabilities

#### VLAN Configuration
```
VLAN 10: LED Controllers (192.168.10.0/24)
VLAN 20: Management Network (192.168.20.0/24)  
VLAN 30: Blockchain Services (192.168.30.0/24)
VLAN 100: Internet Access
```

### Firewall and Security Configuration

#### Required Port Access
```
Outbound:
- Port 80/443: Blockchain API access
- Port 123: NTP time synchronization
- Port 53: DNS resolution

Inbound:
- Port 80: Web interface (management VLAN only)
- Port 22: SSH access (management VLAN only)
- Custom ports: OTA update service
```

## Blockchain Connection Setup

### API Configuration

#### Ethereum/Polygon Setup
1. Obtain API keys from providers (Infura, Alchemy, QuickNode)
2. Configure multiple RPC endpoints for redundancy
3. Set up rate limiting and request queuing
4. Implement connection health monitoring

#### Configuration Example
```json
{
  "blockchain_config": {
    "primary_rpc": "https://mainnet.infura.io/v3/YOUR_KEY",
    "backup_rpc": "https://eth-mainnet.alchemyapi.io/v2/YOUR_KEY",
    "fallback_rpc": "https://api.mycryptoapi.com/eth",
    "contract_address": "0x...",
    "polling_interval": 5000,
    "timeout_ms": 10000,
    "max_retries": 3,
    "backoff_multiplier": 2.0
  }
}
```

### NFT Monitoring Configuration

#### Contract Setup
1. Add NFT contract addresses to monitoring list
2. Configure event filters for specific tokens
3. Set up color mapping rules
4. Define fallback patterns for offline scenarios

#### Event Mapping Configuration
```json
{
  "nft_mappings": [
    {
      "contract": "0x...",
      "token_id": "1",
      "owner_color": "#FF0000",
      "sale_color": "#00FF00",
      "transfer_color": "#0000FF",
      "tile_positions": [0, 1, 2, 3]
    }
  ]
}
```

## System Integration Testing

### Hardware Testing Sequence

#### Power System Test
1. Measure voltage at all power injection points
2. Verify current consumption under full load
3. Test thermal performance during extended operation
4. Validate surge protection and fusing
5. Measure power quality (THD, power factor)

#### LED Array Test
1. Individual tile color test (red, green, blue, white)
2. Full array brightness sweep test
3. Pattern animation test
4. Data integrity test (check for dead/stuck pixels)
5. Color accuracy and uniformity test

#### Network Connectivity Test
1. WiFi signal strength measurement at all controllers
2. Ethernet link speed and quality test
3. Network latency and packet loss measurement
4. Failover testing (primary/backup network paths)
5. Bandwidth utilization under full load

### Software Integration Testing

#### Blockchain Communication Test
```bash
# API connectivity test
curl -X POST \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
  https://mainnet.infura.io/v3/YOUR_KEY

# NFT data retrieval test  
curl "https://api.opensea.io/api/v1/asset/CONTRACT_ADDRESS/TOKEN_ID/"
```

#### Error Handling Test
1. Network disconnection recovery test
2. API rate limiting response test
3. Invalid data handling test
4. Power cycle recovery test
5. Firmware update failure recovery

## Production Deployment

### Deployment Checklist

#### Pre-Deployment Validation
- [ ] All hardware tests passed
- [ ] Software integration tests completed
- [ ] Network connectivity verified
- [ ] Blockchain API access confirmed
- [ ] Documentation complete and accessible
- [ ] Support team trained on system operation

#### Deployment Process
1. **Stage 1**: Deploy single controller/tile for 24-hour test
2. **Stage 2**: Deploy 25% of system, monitor for 48 hours
3. **Stage 3**: Deploy remaining system in phases
4. **Stage 4**: Full system integration and performance validation
5. **Stage 5**: Handover to operations team

#### Configuration Management
1. Lock down production configurations
2. Implement change control procedures
3. Set up monitoring and alerting systems
4. Configure automated backup schedules
5. Establish maintenance windows and procedures

### Monitoring and Maintenance Setup

#### System Monitoring
- [ ] Network uptime monitoring
- [ ] Power consumption monitoring  
- [ ] Temperature monitoring
- [ ] LED panel health monitoring
- [ ] Blockchain connectivity monitoring
- [ ] Error rate and performance metrics

#### Maintenance Procedures
- [ ] Daily visual inspection checklist
- [ ] Weekly system health reports
- [ ] Monthly performance analysis
- [ ] Quarterly hardware maintenance
- [ ] Annual system upgrades and updates

## Post-Deployment Verification

### Acceptance Testing

#### Performance Verification
1. Verify response time to blockchain events < 10 seconds
2. Confirm color accuracy and consistency across all tiles
3. Validate system availability > 99.9% over 30-day period
4. Test failover procedures and recovery times
5. Verify all monitoring systems operational

#### Documentation Handover
1. Provide complete system documentation
2. Deliver troubleshooting guides and procedures
3. Transfer configuration backups and version control
4. Complete operator training and certification
5. Establish support escalation procedures

#### Sign-off Criteria
- [ ] All functional requirements verified
- [ ] Performance benchmarks met
- [ ] Reliability targets achieved
- [ ] Documentation delivered and accepted
- [ ] Support team trained and certified
- [ ] Client acceptance obtained

### Long-term Success Metrics
- System uptime > 99.9%
- Response time to blockchain events < 10 seconds
- Zero unplanned outages due to configuration issues
- Mean time to resolution < 2 hours for any issues
- Client satisfaction score > 95%

---

**Note**: This deployment guide should be customized for specific installation requirements and maintained as a living document throughout the project lifecycle. Regular updates ensure procedures remain current with hardware revisions and software updates.