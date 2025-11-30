#!/usr/bin/env node
require('dotenv').config();

const crypto = require('crypto');
const axios = require('axios');

/**
 * Webhook Simulator - Sends fake Alchemy NFT webhook payloads for testing
 *
 * Usage:
 *   node scripts/simulate-webhook.js --type=sale
 *   node scripts/simulate-webhook.js --type=transfer --count=5
 *   node scripts/simulate-webhook.js --type=mint --contract=0x...
 */

const PROCESSOR_URL = process.env.PROCESSOR_URL || 'http://localhost:3000';
const SIGNING_KEY = process.env.ALCHEMY_SIGNING_KEY || 'test_signing_key';

// Sample NFT collections for realistic simulation
const COLLECTIONS = [
  { name: 'Bored Ape Yacht Club', address: '0xBC4CA0EdA7647A8aB7C2061c2E118A18a936f13D' },
  { name: 'CryptoPunks', address: '0xb47e3cd837dDF8e4c57F05d70Ab865de6e193BBB' },
  { name: 'Azuki', address: '0xED5AF388653567Af2F388E6224dC7C4b3241C544' },
  { name: 'Doodles', address: '0x8a90CAb2b38dba80c64b7734e58Ee1dB38B8992e' },
  { name: 'CloneX', address: '0x49cF6f5d44E70224e2E23fDcdd2C053F30aDA28B' }
];

// OpenSea Seaport contract (for sale detection)
const OPENSEA_SEAPORT = '0x00000000006c3852cbef3e08e8df289169ede581';

function generateRandomAddress() {
  return '0x' + crypto.randomBytes(20).toString('hex');
}

function generateWebhookPayload(type, options = {}) {
  const collection = options.collection || COLLECTIONS[Math.floor(Math.random() * COLLECTIONS.length)];
  const tokenId = options.tokenId || Math.floor(Math.random() * 10000).toString();
  const webhookId = crypto.randomUUID();
  const eventId = crypto.randomUUID();

  let fromAddress, toAddress;

  switch (type) {
    case 'mint':
      fromAddress = '0x0000000000000000000000000000000000000000';
      toAddress = generateRandomAddress();
      break;
    case 'sale':
      fromAddress = OPENSEA_SEAPORT;
      toAddress = generateRandomAddress();
      break;
    case 'transfer':
    default:
      fromAddress = generateRandomAddress();
      toAddress = generateRandomAddress();
      break;
  }

  return {
    webhookId,
    id: eventId,
    createdAt: new Date().toISOString(),
    type: 'NFT_ACTIVITY',
    event: {
      type: 'NFT_ACTIVITY',
      network: 'ETH_MAINNET',
      activity: [
        {
          blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
          contractAddress: collection.address,
          erc721TokenId: tokenId,
          fromAddress,
          toAddress,
          hash: '0x' + crypto.randomBytes(32).toString('hex'),
          log: {
            transactionHash: '0x' + crypto.randomBytes(32).toString('hex'),
            blockNumber: Math.floor(Math.random() * 1000000) + 18000000,
            address: collection.address
          },
          category: type.toUpperCase()
        }
      ]
    }
  };
}

function signPayload(payload) {
  const body = JSON.stringify(payload);
  const hmac = crypto.createHmac('sha256', SIGNING_KEY);
  hmac.update(body, 'utf8');
  return hmac.digest('hex');
}

async function sendWebhook(type, options = {}) {
  const payload = generateWebhookPayload(type, options);
  const signature = signPayload(payload);

  console.log(`\nSending ${type.toUpperCase()} webhook...`);
  console.log(`  Collection: ${payload.event.activity[0].contractAddress.substring(0, 10)}...`);
  console.log(`  Token ID: ${payload.event.activity[0].erc721TokenId}`);
  console.log(`  From: ${payload.event.activity[0].fromAddress.substring(0, 10)}...`);
  console.log(`  To: ${payload.event.activity[0].toAddress.substring(0, 10)}...`);

  try {
    const response = await axios.post(
      `${PROCESSOR_URL}/webhook/nft-activity`,
      payload,
      {
        headers: {
          'Content-Type': 'application/json',
          'x-alchemy-signature': signature
        },
        timeout: 10000
      }
    );

    console.log(`  Status: ${response.status} ${response.statusText}`);
    console.log(`  Response:`, response.data);
    return { success: true, response: response.data };
  } catch (error) {
    console.error(`  Error: ${error.message}`);
    if (error.response) {
      console.error(`  Response: ${JSON.stringify(error.response.data)}`);
    }
    return { success: false, error: error.message };
  }
}

async function main() {
  const args = process.argv.slice(2);
  const options = {};

  // Parse command line arguments
  for (const arg of args) {
    const [key, value] = arg.replace('--', '').split('=');
    options[key] = value;
  }

  const type = options.type || 'transfer';
  const count = parseInt(options.count) || 1;
  const delay = parseInt(options.delay) || 1000;

  console.log('='.repeat(50));
  console.log('NFT Webhook Simulator');
  console.log('='.repeat(50));
  console.log(`Target: ${PROCESSOR_URL}`);
  console.log(`Event Type: ${type}`);
  console.log(`Count: ${count}`);
  console.log(`Delay: ${delay}ms`);

  const results = { success: 0, failed: 0 };

  for (let i = 0; i < count; i++) {
    if (i > 0) {
      await new Promise(resolve => setTimeout(resolve, delay));
    }

    console.log(`\n--- Event ${i + 1}/${count} ---`);
    const result = await sendWebhook(type, options);

    if (result.success) {
      results.success++;
    } else {
      results.failed++;
    }
  }

  console.log('\n' + '='.repeat(50));
  console.log('Summary');
  console.log('='.repeat(50));
  console.log(`Success: ${results.success}`);
  console.log(`Failed: ${results.failed}`);
}

// Run if called directly
if (require.main === module) {
  main().catch(console.error);
}

module.exports = { sendWebhook, generateWebhookPayload, signPayload };
