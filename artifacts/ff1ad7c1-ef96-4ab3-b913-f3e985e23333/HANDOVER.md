# NFT LED Board - Handover Document

## Project Status: READY TO RUN

**Last Updated:** 2025-11-29
**Current Phase:** COMPLETE - All phases implemented + Research organized

---

## Project Structure

```
artifacts/ff1ad7c1-ef96-4ab3-b913-f3e985e23333/
├── contracts/                    # Smart Contracts (Solidity + Hardhat)
│   ├── hardhat.config.js         # Hardhat deployment config
│   └── TileNFT.sol               # NFT smart contract for tiles
│
├── backend/                      # Node.js Backend Services
│   ├── ownership_verification_backend.js   # NFT ownership verification
│   └── authentication_middleware.js        # API auth middleware
│
├── firmware/                     # ESP32 Arduino Code
│   ├── esp32_led_matrix_core.ino # Core LED matrix firmware
│   └── prototype_test_code.ino   # Prototype/test firmware
│
├── Panel/                        # LED Simulation (Docker-based)
│   ├── docker-compose.yml
│   ├── Dockerfile
│   ├── nft-event-processor.js
│   ├── mock-esp32-server.js
│   ├── esp32-communication-service.js
│   ├── esp32-http-client.js
│   ├── package.json
│   ├── .env / .env.example
│   ├── ALCHEMY_SETUP.md
│   ├── public/visualizer.html
│   └── scripts/simulate-webhook.js
│
├── docs/                         # Documentation (16 files)
│   ├── blockchain_integration_nft_research.md
│   ├── blockchain_led_system_architecture.md
│   ├── deployment_guide.md
│   ├── esp32_ws2812b_matrix_setup.md
│   └── ... (12 more)
│
└── HANDOVER.md                   # This file
```

---

## Quick Start (Panel Simulation)

```bash
# 1. Navigate to Panel folder
cd Panel

# 2. Start everything with Docker
docker-compose up --build

# 3. Open visualizer in browser
# Visit: http://localhost:3001/

# 4. Simulate NFT events (in another terminal)
node scripts/simulate-webhook.js --type=sale
```

---

## Component Overview

### Smart Contracts (`contracts/`)
- **TileNFT.sol**: ERC-721 NFT contract for LED tile ownership
- **hardhat.config.js**: Deployment to Sepolia/Mumbai testnets

### Backend (`backend/`)
- **ownership_verification_backend.js**: Verifies NFT ownership on-chain
- **authentication_middleware.js**: API authentication layer

### Firmware (`firmware/`)
- **esp32_led_matrix_core.ino**: Core 8x8 WS2812B LED matrix control
- **prototype_test_code.ino**: Test/prototype code

### Panel Simulation (`Panel/`)
- Full Docker-based simulation environment
- Mock ESP32 server
- Browser-based LED visualizer
- Webhook simulator for testing

---

## Color Mapping

| Event Type | Color | RGB Value |
|------------|-------|-----------|
| NFT Transfer | Blue | (0, 100, 255) |
| NFT Sale | Gold | (255, 215, 0) |
| NFT Mint | White | (255, 255, 255) |

---

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Alchemy        │────▶│  NFT Processor   │────▶│  Mock ESP32     │
│  Webhooks       │     │  (Port 3000)     │     │  (Port 3001)    │
└─────────────────┘     └────────┬─────────┘     └────────┬────────┘
                                 │                        │
                                 ▼                        ▼
                        ┌────────────────┐      ┌─────────────────┐
                        │     Redis      │      │   Visualizer    │
                        │  (Port 6379)   │      │   (Browser)     │
                        └────────────────┘      └─────────────────┘
```

---

## Next Steps

1. **Test Panel simulation**: `cd Panel && docker-compose up --build`
2. **Deploy smart contract**: `cd contracts && npx hardhat run scripts/deploy.js --network sepolia`
3. **Set up Alchemy webhooks**: Follow `Panel/ALCHEMY_SETUP.md`
4. **Flash ESP32 hardware**: Use Arduino IDE with `firmware/esp32_led_matrix_core.ino`

---

## Notes

- Panel simulation works without hardware
- Smart contracts ready for testnet deployment
- All documentation in `docs/` folder
