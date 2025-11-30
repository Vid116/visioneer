# Crypto Billboard - Business Plan

## The Concept

**"The World's First Crypto Billboard - Own a Pixel IRL"**

A 32x32 LED board installed in a real-world venue (bar/cafe/coworking), where each pixel is an NFT. Owners control their pixel's color. A live camera feed proves it's real.

---

## The Experience

The product isn't the NFT - it's the experience of owning a piece of a real, physical display.

- People at the venue see the board → "wtf is this" → scan QR code
- Crypto twitter sees live camera → "this is actually real" → shares
- Tile owners flex → "I own pixel 12,7 at this bar" → shares

---

## Hardware Costs

| Item | Cost |
|------|------|
| 32x32 LED Matrix Panel | $50-100 |
| Raspberry Pi 4 | $50 |
| Webcam | $20 |
| Power supply + cables | $30 |
| **Total** | **~$150-200** |

---

## Revenue Model

### Phase 1: Fair Launch (Primary Sales)

| Metric | Value |
|--------|-------|
| Grid size | 32x32 = 1,024 tiles |
| Price per tile | 0.003 ETH (~$5) |
| Max revenue | $5,120 |
| Break-even | 300 tiles ($1,500) |

**Fair launch rules:**
- All tiles same price
- First come first served
- No whitelists, no presale, no BS

### Phase 2: Built-in Marketplace (Secondary Sales)

After launch, owners can resell tiles on YOUR website.

| Fee | Revenue per $100 trade |
|-----|------------------------|
| 2.5% | $2.50 |
| 5% | $5.00 |

**Why they'll use your marketplace (not OpenSea):**
- Buyers are already on your site (camera feed brings them)
- Seamless UX - pick tile from live grid → buy instantly
- No need to explain "go to opensea, search contract..."
- Your site = the experience, the audience, the action

**"Don't like our fee? Build your own marketplace, ser."**

### Phase 3: Ongoing Revenue

- **Venue partnership** - They pay to extend beyond 1 month
- **Sponsors** - Premium tiles or animated sections
- **Expansion** - New city = new board = new drop

---

## Home Kit Sales (Hardware Revenue)

### The Concept

Sell small plug-and-play LED kits that display a "window" into the main board.

| Kit Size | Pixels | Price | Your Cost | Margin |
|----------|--------|-------|-----------|--------|
| 4x4 | 16 | $40 | ~$15 | $25 |
| 8x8 | 64 | $70 | ~$30 | $40 |

### How It Works

1. Customer buys a Home Kit from your store
2. Kit comes pre-configured to connect to your NFT system
3. Customer chooses which 4x4 (or 8x8) section of the 32x32 board to display
4. Their home kit mirrors that section in real-time

### The Genius Part

- **Pan anywhere** - Kit owner can view ANY section of the board
- **Control requires ownership** - Want to control what you see? Buy those tiles.
- **Creates tile demand** - "I have a kit showing tiles 0-15, better buy them so I control my display"

### Example User Journey

```
Buys 4x4 Home Kit ($40)
        ↓
Sets window to top-left corner (tiles 0-15)
        ↓
Sees someone else's colors on their desk
        ↓
"I want to control this"
        ↓
Buys those 16 tiles ($80)
        ↓
Now controls their home display
```

### Revenue Math

| Scenario | Revenue |
|----------|---------|
| Sell 50 Home Kits | 50 × $25 margin = $1,250 |
| Each kit buyer buys 16 tiles | 50 × 16 × $5 = $4,000 |
| **Combined** | **$5,250 additional revenue** |

### Why This Is Powerful

- **Recurring hardware sales** - New kits for each season
- **Network effect** - More kits = more tile demand
- **Physical product** - People love owning things
- **Desk flex** - "This is live from a bar in Ljubljana"
- **Gift potential** - Buy kit for friend, they get into crypto

---

## Seasonal Model

Run in 1-month "seasons" with breaks between.

**Why seasons:**
- Fresh drops = new hype cycles
- "Season 1", "Season 2" = collectible narrative
- Time to fix issues, upgrade, move venues
- FOMO - "only 30 days left!"
- Previous season tiles become collectibles

**Season structure:**
- Week 1-4: Board is LIVE
- Break: 1-2 weeks to prep next location
- Next season: New city, new board, new tiles

**"Season 1: Ljubljana" → "Season 2: Vienna" → "Season 3: Berlin"**

---

## The Venue Deal

Approach bars/cafes/coworking spaces with:

> "Free art installation for 1 month. It's an interactive LED display that brings foot traffic. People come to see it, scan the QR, buy drinks. You provide wall space + power + wifi. I handle everything else."

**Why they say yes:**
- Zero cost to them
- Unique talking point
- Tech/crypto crowd = spending customers
- Instagram-worthy installation

---

## Website Features

1. **Live camera feed** - Proves it's real, not a simulation
2. **Location info** - Map, venue name, opening hours
3. **Mint interface** - Pick tile, pay ETH, set color
4. **Marketplace** - List/buy tiles with built-in fee
5. **Ownership view** - See who owns what
6. **Home Kit store** - Buy hardware kits
7. **Kit configurator** - Choose your window position
8. **Mobile-friendly** - QR code at venue leads here

---

## Timeline

| Week | Milestone |
|------|-----------|
| 1 | Secure venue, order hardware |
| 2 | Build website + scale contract to 32x32 |
| 3 | Install hardware, test camera feed |
| 4 | Launch, promote, sell tiles |
| 5+ | Develop Home Kit product |

---

## What's Already Built

- TileNFT smart contract (ERC-721) - working on Sepolia testnet
- Wallet connection + ownership verification
- Color picker interface
- Mock LED server (ready to swap for real hardware)

---

## What's Needed

1. **Find a venue** - This is the unlock
2. **Scale contract** - 8x8 → 32x32 (1,024 tiles)
3. **Hardware setup** - Pi + LED matrix + camera
4. **Website** - Mint page + marketplace + live feed
5. **Marketing** - Crypto twitter, local press
6. **Home Kit development** - After Season 1 validates concept

---

## The Viral Loop

```
Venue visitor sees board
        ↓
Scans QR code on wall
        ↓
Lands on website with live feed
        ↓
"Holy shit this is real"
        ↓
Buys a tile, shares on twitter
        ↓
Followers see live camera proof
        ↓
They buy tiles + Home Kits
        ↓
More kits = more tile demand
        ↓
Repeat
```

---

## Complete Revenue Stack

| Source | Potential |
|--------|-----------|
| Primary tile sales | $5,120 |
| Marketplace fees (5%) | $1,000+ |
| Home Kit margins | $1,250+ (50 kits) |
| Kit-driven tile sales | $4,000+ |
| Venue extensions | $500+/month |
| Sponsors | Variable |
| **Season 1 Total** | **$10,000+** |

---

## Risk Mitigation

| Risk | Mitigation |
|------|------------|
| No venue says yes | Start with personal network, offer revenue share |
| Low sales | $150 hardware cost is recoverable, keep for next project |
| Tech issues | Test thoroughly before launch, have backup Pi |
| Venue backs out | Contract for 1 month minimum, hardware is portable |
| No secondary trading | Marketplace is bonus, primary sales cover costs |
| Home Kits don't sell | Only produce after Season 1 validates demand |

---

## Success Metrics

| Outcome | Result |
|---------|--------|
| Minimum viable | 300 tiles sold = $1,500 (covers costs + profit) |
| Good | 500 tiles sold = $2,500 |
| Great | 800+ tiles sold = $4,000+ |
| Viral | Sellout + active marketplace + kits selling + S2 planned |

---

## Next Step

**Find a venue.** Everything else is code.
