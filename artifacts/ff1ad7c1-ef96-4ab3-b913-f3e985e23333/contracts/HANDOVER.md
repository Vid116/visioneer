# TileNFT Smart Contract - Handover Document

## Project Status: DEPLOYED & INTEGRATED

**Last Updated:** 2025-11-29
**Current Phase:** Live on Sepolia - Wallet integration complete

---

## Deployed Contract

| Property | Value |
|----------|-------|
| Contract Address | `0xeE3474805Bc1A0Cdc13B1A758D1e35F057BA6AFD` |
| Network | Sepolia Testnet |
| Deployer/Owner | `0x830C38C1a5a820d664520b6e79b1ad62124B3b64` |
| Etherscan | https://sepolia.etherscan.io/address/0xeE3474805Bc1A0Cdc13B1A758D1e35F057BA6AFD |

---

## Project Structure

```
contracts/
├── contracts/
│   └── TileNFT.sol              # Main NFT contract (ERC-721)
├── scripts/
│   └── deploy.js                # Deployment script
├── .env                         # Private key & API keys (DO NOT COMMIT)
├── hardhat.config.js            # Hardhat configuration
├── package.json                 # Dependencies
└── HANDOVER.md                  # This file

Panel/
├── mock-esp32-server.js         # LED grid simulator (port 3001)
├── ownership_verification_backend.js  # Wallet auth & ownership API (port 3002)
├── nft-event-processor.js       # Alchemy webhook handler (port 3000, needs Redis)
├── public/
│   └── visualizer.html          # Web UI with wallet connect
└── .env                         # RPC URLs and config
```

---

## What's Working

| Feature | Status |
|---------|--------|
| TileNFT contract deployed to Sepolia | DONE |
| All 64 tiles minted to deployer | DONE |
| MetaMask wallet connection | DONE |
| Signature-based authentication (JWT) | DONE |
| Ownership verification via contract | DONE |
| Color picker for owned tiles | DONE |
| Real-time tile color updates | DONE |
| NFT transfers update ownership | DONE |

---

## How to Run

**Terminal 1 - LED Grid Simulator + Visualizer:**
```bash
cd Panel
node mock-esp32-server.js
```

**Terminal 2 - Ownership Verification Backend:**
```bash
cd Panel
node ownership_verification_backend.js
```

**Open Browser:**
```
http://localhost:3001
```

1. Click "Connect Wallet"
2. Sign the message in MetaMask
3. Your owned tiles show green dots
4. Click a tile you own → pick color → Apply

---

## Contract Details

| Property | Value |
|----------|-------|
| Contract Name | TileNFT |
| Token Standard | ERC-721 |
| Token Name | LED Board Tiles |
| Token Symbol | TILE |
| Total Supply | 64 tiles (8x8 grid) |
| Solidity Version | 0.8.20 |
| Optimizer | Enabled (200 runs) |

---

## Transfer NFTs

To transfer tiles to another wallet:

**Option 1: OpenSea Testnet**
- https://testnets.opensea.io/assets/sepolia/0xeE3474805Bc1A0Cdc13B1A758D1e35F057BA6AFD/0
- Connect wallet → Transfer

**Option 2: Hardhat Console**
```bash
cd contracts
npx hardhat console --network sepolia
```
```javascript
const contract = await ethers.getContractAt("TileNFT", "0xeE3474805Bc1A0Cdc13B1A758D1e35F057BA6AFD")
await contract.transferFrom("YOUR_ADDRESS", "RECIPIENT_ADDRESS", TILE_ID)
```

Ownership changes reflect within 1 minute (cache timeout).

---

## Environment Variables

**contracts/.env**
```env
PRIVATE_KEY=your_64_char_hex_private_key_here
SEPOLIA_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
```

**Panel/.env**
```env
ETHEREUM_RPC_URL=https://eth-sepolia.g.alchemy.com/v2/YOUR_KEY
ESP32_BASE_URL=http://localhost:3001
```

---

## Next Steps

1. [ ] Connect to real ESP32 hardware instead of mock server
2. [ ] Add marketplace functionality (list/buy tiles)
3. [ ] Deploy to mainnet when ready

---

## Architecture

```
User Browser (localhost:3001)
    │
    ├── MetaMask (wallet signature)
    │
    ├── Ownership Backend (port 3002)
    │       │
    │       └── Sepolia RPC (Alchemy)
    │               │
    │               └── TileNFT Contract
    │
    └── Mock ESP32 (port 3001)
            │
            └── LED Grid State (in-memory)
```
