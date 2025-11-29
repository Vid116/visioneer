# Blockchain-Connected LED Ad Board System Architecture

## Executive Summary

A comprehensive system design for a blockchain-responsive LED ad board that changes tile colors based on specific NFT activity. The architecture leverages real-time webhook notifications, robust caching strategies, and reliable hardware control to create a responsive display system.

## System Architecture Overview

### Core Components

1. **Data Layer**: Blockchain APIs and webhook services
2. **Processing Layer**: Backend server with caching and logic
3. **Communication Layer**: WiFi-based real-time data transmission
4. **Hardware Layer**: ESP32-controlled LED matrix panels
5. **Monitoring Layer**: Health checks and failover mechanisms

## Detailed System Design

### 1. Data Acquisition Layer

#### Primary Data Source: Alchemy Webhooks
- **Service**: Alchemy NFT Activity Webhooks
- **Features**: 
  - At-least-once delivery guarantee
  - Custom filtering for specific collections/tokens
  - Support for NFT transfers, sales, and metadata updates
  - 99.9% uptime SLA
- **Implementation**:
  ```
  Webhook URL: https://your-server.com/api/nft-webhook
  Events: nft_activity, nft_metadata_update, nft_transfer
  Filters: Contract addresses, token IDs, activity types
  ```

#### Backup Data Sources
1. **Alchemy REST API**: Polling fallback every 30 seconds
2. **QuickNode Webhooks**: Secondary webhook provider
3. **OpenSea API**: Market data backup (rate limited)

#### Supported Blockchains
- **Primary**: Polygon (low fees, fast confirmation)
- **Secondary**: Ethereum (high-value collections)
- **Tertiary**: Base, Arbitrum (emerging markets)

### 2. Backend Processing System

#### Server Architecture
- **Technology**: Node.js with Express.js
- **Deployment**: Docker containers on cloud platform
- **Scaling**: Horizontal scaling with load balancer

#### Data Processing Pipeline
```
Webhook → Validation → NFT Data Enrichment → Color Mapping → Cache Update → Hardware Notification
```

#### Color Mapping Logic
- **Collection-based**: Different collections = different base colors
- **Rarity-based**: Trait rarity affects color intensity/hue
- **Activity-based**: 
  - Sale: Gold/Yellow variants
  - Transfer: Blue variants  
  - Listing: Green variants
  - Mint: White/Rainbow effects
- **Price-based**: Higher values = brighter/more vibrant colors

#### Processing Rules
- **Update Frequency**: Real-time via webhooks, max 1 update/second per tile
- **Batch Processing**: Group multiple updates for same tile within 500ms
- **Priority System**: High-value transactions get immediate processing

### 3. Caching Strategy

#### Multi-Layer Cache Architecture

##### Layer 1: In-Memory Cache (Redis)
- **Purpose**: Ultra-fast access to current display state
- **Data**: Current tile colors, last update timestamps
- **TTL**: No expiration (persistent state)
- **Size**: ~1MB for 32x32 matrix

##### Layer 2: Application Cache
- **Purpose**: NFT metadata and collection info
- **Data**: Token metadata, collection floor prices, trait rarities
- **TTL**: 1 hour for metadata, 5 minutes for price data
- **Size**: ~100MB buffer

##### Layer 3: Database Cache
- **Purpose**: Historical data and analytics
- **Database**: PostgreSQL with time-series optimization
- **Data**: Transaction history, display state changes
- **Retention**: 30 days detailed, 1 year aggregated

#### Cache Invalidation Strategy
- **Real-time**: Webhook events immediately invalidate relevant cache entries
- **Scheduled**: Metadata refresh every 6 hours
- **On-demand**: Manual cache clearing via admin interface

### 4. Hardware Control System

#### Microcontroller: ESP32
- **Model**: ESP32 DevKit V1 or similar
- **Memory**: 4MB flash minimum, 8MB recommended
- **Connectivity**: 802.11 b/g/n WiFi
- **GPIO**: Pin 12 for LED data, additional pins for sensors

#### LED Matrix Configuration
- **Type**: WS2812B individually addressable LEDs
- **Size Options**:
  - Small: 16x16 (256 LEDs) - $50-80
  - Medium: 32x16 (512 LEDs) - $100-150  
  - Large: 32x32 (1024 LEDs) - $200-300
- **Power**: 5V/4A minimum, 5V/10A for large matrices
- **Data Protocol**: Single-wire control with 220Ω resistor

#### Control Software
- **Base**: Modified PIXELIX firmware
- **Features**:
  - WiFi connectivity with auto-reconnect
  - REST API endpoint for color updates
  - OTA firmware updates
  - Local display state caching
  - Brightness auto-adjustment

### 5. Communication Protocol

#### Server-to-Hardware Communication
```json
{
  "type": "tile_update",
  "tiles": [
    {
      "x": 5,
      "y": 3,
      "color": "#FF6B35",
      "effect": "fade",
      "duration": 1000
    }
  ],
  "timestamp": "2024-01-01T12:00:00Z"
}
```

#### Hardware-to-Server Heartbeat
```json
{
  "device_id": "pixelix_001",
  "status": "online",
  "uptime": 86400,
  "wifi_strength": -42,
  "led_count": 1024,
  "last_update": "2024-01-01T11:59:30Z"
}
```

### 6. Failover and Reliability Mechanisms

#### Data Source Failover
1. **Primary**: Alchemy webhooks fail → Switch to polling mode
2. **Secondary**: Alchemy service down → Activate QuickNode backup
3. **Tertiary**: All APIs down → Display cached "service maintenance" pattern

#### Hardware Failover
- **WiFi Disconnection**: Store updates locally, retry connection every 30s
- **Power Loss**: Resume from last known state on restart
- **LED Failure**: Individual LED failures don't affect system (graceful degradation)

#### Server Redundancy
- **Load Balancer**: Distribute traffic across multiple server instances  
- **Health Checks**: Remove unhealthy instances automatically
- **Database Replication**: Primary-secondary PostgreSQL setup
- **Cache Replication**: Redis clustering for high availability

### 7. Update Frequencies and Performance

#### Real-time Performance Targets
- **Webhook to Display**: <2 seconds end-to-end
- **Polling Fallback**: 30-second intervals
- **Cache Hit Ratio**: >95% for metadata queries
- **System Uptime**: 99.5% target availability

#### Rate Limiting
- **API Requests**: 1000/minute to blockchain APIs
- **Hardware Updates**: Max 60 updates/minute per device
- **Webhook Processing**: 500 events/minute capacity

### 8. Monitoring and Analytics

#### System Health Monitoring
- **Metrics**: Response times, error rates, cache hit ratios
- **Alerting**: Email/SMS for critical failures
- **Dashboard**: Real-time system status display
- **Logging**: Structured logs with 30-day retention

#### Business Analytics  
- **Display Metrics**: Most active collections, color distribution
- **Performance Metrics**: Update latency, system utilization
- **User Engagement**: API usage patterns, popular endpoints

## Deployment Architecture

### Cloud Infrastructure
- **Platform**: AWS/GCP/Azure
- **Compute**: Container-based auto-scaling
- **Database**: Managed PostgreSQL + Redis
- **Storage**: S3-compatible for logs and backups
- **CDN**: CloudFlare for global API acceleration

### Security Considerations
- **API Keys**: Secure vault storage (HashiCorp Vault)
- **Webhook Validation**: HMAC signature verification
- **Network**: VPC with private subnets for databases
- **SSL/TLS**: End-to-end encryption for all communications

## Cost Analysis

### Monthly Operating Costs (Medium Scale: 32x16 display)
- **Alchemy API**: $49/month (Growth plan)
- **Cloud Infrastructure**: $100-200/month
- **Hardware Amortization**: $10/month (2-year lifespan)
- **Total**: ~$160-260/month operational

### One-time Setup Costs
- **Hardware**: $150-200 (ESP32 + LED matrix + power supply)
- **Development**: $5,000-10,000 (full system implementation)
- **Testing/Deployment**: $1,000-2,000

## Implementation Timeline

### Phase 1 (Weeks 1-2): Core Infrastructure
- Set up cloud infrastructure and databases
- Implement webhook handling and basic API
- Create basic color mapping logic

### Phase 2 (Weeks 3-4): Hardware Integration  
- ESP32 firmware development and testing
- WiFi communication protocols
- LED matrix control implementation

### Phase 3 (Weeks 5-6): Advanced Features
- Implement caching strategies
- Add failover mechanisms
- Create monitoring and analytics

### Phase 4 (Weeks 7-8): Testing and Optimization
- Load testing and performance optimization  
- End-to-end system testing
- Documentation and deployment preparation

## Risk Assessment

### High Risk
- **Blockchain API Downtime**: Mitigated by multiple providers
- **WiFi Connectivity Issues**: Mitigated by local caching
- **LED Hardware Failure**: Mitigated by modular design

### Medium Risk  
- **Rate Limiting**: Managed through intelligent caching
- **Power Supply Issues**: Requires reliable electrical infrastructure
- **Scalability Bottlenecks**: Addressed through cloud auto-scaling

### Low Risk
- **Data Accuracy**: Verified through multiple sources
- **Security Breaches**: Minimized through standard security practices

## Conclusion

This architecture provides a robust, scalable foundation for a blockchain-responsive LED ad board system. The design emphasizes reliability through multiple failover mechanisms, performance through intelligent caching, and maintainability through modular components. The system can handle real-time NFT activity across multiple blockchains while maintaining visual responsiveness and operational reliability.