# Alchemy Webhook Setup Guide

This guide walks you through setting up Alchemy webhooks to receive real-time NFT activity events.

## Prerequisites

- An Alchemy account (free tier works)
- Your NFT processor running and accessible from the internet (use ngrok for local testing)

## Step 1: Create an Alchemy Account

1. Go to [https://www.alchemy.com/](https://www.alchemy.com/)
2. Click "Sign Up" and create a free account
3. Verify your email address

## Step 2: Create an App

1. In the Alchemy Dashboard, click "Create App"
2. Fill in:
   - **Name**: NFT LED Board
   - **Description**: LED board that responds to NFT events
   - **Chain**: Ethereum (or your preferred chain)
   - **Network**: Mainnet
3. Click "Create App"

## Step 3: Set Up a Webhook

1. Go to the [Webhooks page](https://dashboard.alchemy.com/webhooks)
2. Click "Create Webhook"
3. Configure the webhook:

   **Webhook Type**: NFT Activity

   **Network**: Select your network (ETH Mainnet, Polygon, etc.)

   **Webhook URL**: Your processor endpoint
   - For local testing: `https://your-ngrok-url.ngrok.io/webhook/nft-activity`
   - For production: `https://your-domain.com/webhook/nft-activity`

   **NFT Filters** (optional):
   - You can filter by specific contract addresses
   - Leave empty to receive all NFT activity

4. Click "Create Webhook"

## Step 4: Get Your Signing Key

1. After creating the webhook, click on it to view details
2. Find the "Signing Key" section
3. Copy the signing key

## Step 5: Configure Your Environment

Add the signing key to your `.env` file:

```env
ALCHEMY_SIGNING_KEY=your_signing_key_here
```

## Step 6: Expose Local Server (for Development)

To test with real blockchain events locally, use ngrok:

```bash
# Install ngrok
npm install -g ngrok

# Start your processor
docker-compose up

# In another terminal, expose port 3000
ngrok http 3000
```

Copy the ngrok HTTPS URL and update your Alchemy webhook URL.

## Step 7: Test the Webhook

### Option A: Use Alchemy's Test Feature

1. In the webhook settings, click "Send Test Notification"
2. Watch your terminal for incoming events
3. Check the visualizer at `http://localhost:3001/visualizer.html`

### Option B: Use the Webhook Simulator

```bash
# Simulate a transfer
node scripts/simulate-webhook.js --type=transfer

# Simulate a sale
node scripts/simulate-webhook.js --type=sale

# Simulate a mint
node scripts/simulate-webhook.js --type=mint

# Simulate multiple events
node scripts/simulate-webhook.js --type=transfer --count=10
```

## Webhook Payload Structure

Alchemy sends NFT activity in this format:

```json
{
  "webhookId": "wh_abc123",
  "id": "evt_xyz789",
  "type": "NFT_ACTIVITY",
  "event": {
    "network": "ETH_MAINNET",
    "activity": [
      {
        "blockNumber": 18000000,
        "contractAddress": "0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D",
        "erc721TokenId": "1234",
        "fromAddress": "0x...",
        "toAddress": "0x...",
        "hash": "0x..."
      }
    ]
  }
}
```

## Event Types & Colors

The processor maps events to LED colors:

| Event Type | Detection Logic | LED Color |
|------------|-----------------|-----------|
| Mint | `fromAddress` is null/zero address | White (255, 255, 255) |
| Sale | Involves OpenSea/marketplace address | Gold (255, 215, 0) |
| Transfer | All other transfers | Blue (0, 100, 255) |

## Supported Networks

Alchemy supports NFT activity webhooks on:

- Ethereum Mainnet
- Ethereum Goerli (testnet)
- Polygon Mainnet
- Polygon Mumbai (testnet)
- Arbitrum Mainnet
- Optimism Mainnet

## Troubleshooting

### Webhook Not Receiving Events

1. Check that your server is accessible from the internet
2. Verify the webhook URL is correct (HTTPS required)
3. Check the signing key matches in your `.env`
4. Look at Alchemy's webhook logs for delivery attempts

### Signature Validation Failing

1. Ensure `ALCHEMY_SIGNING_KEY` is set correctly
2. Make sure the request body isn't being modified before validation
3. Check that you're using the raw JSON body for signature verification

### Events Not Updating LEDs

1. Check Redis is running: `docker-compose ps`
2. Check mock ESP32 is healthy: `curl http://localhost:3001/api/health`
3. Look at processor logs: `docker-compose logs nft-processor`

## Cost Considerations

Alchemy's free tier includes:
- 300M compute units/month
- Unlimited webhooks
- Rate limits apply

For high-volume NFT monitoring, consider upgrading to a paid plan.

## Next Steps

1. Add more NFT collections to monitor
2. Customize color mappings for different collections
3. Add rarity-based color intensity
4. Implement price-based color effects
