#!/usr/bin/env node

/**
 * getReceivedCredits.js
 *
 * Fetches and prints received token credits for your address from the escrow process using GetReceivedDetail.
 * Usage:
 *   node scripts/getReceivedCredits.js <YOUR_ADDRESS>
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createDataItemSigner, message, result } from '@permaweb/aoconnect';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function loadConfig() {
  return JSON.parse(
    fs.readFileSync(path.resolve('config', 'config.json'), 'utf-8')
  );
}

function getWallet() {
  const walletPath = process.env.WALLET_PATH;
  if (!walletPath) throw new Error('WALLET_PATH env var not set');
  return JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'));
}

async function main() {
  const cfg = loadConfig();
  const wallet = getWallet();
  const signer = createDataItemSigner(wallet);
  // Get the wallet address (Arweave address)
  let address;
  if (wallet.n) {
    // For RSA wallets, derive address (base64url SHA-256 of modulus)
    const crypto = await import('crypto');
    const modulus = Buffer.from(wallet.n, 'base64');
    const hash = crypto
      .createHash('sha256')
      .update(modulus)
      .digest('base64url');
    address = hash;
  } else if (wallet.address) {
    address = wallet.address;
  } else {
    throw new Error('Could not determine wallet address from keyfile');
  }

  const tags = [
    { name: 'Action', value: 'GetReceivedDetail' },
    { name: 'addr', value: address },
  ];

  const msgId = await message({
    process: cfg.ESCROW_PROCESS_ID,
    signer,
    tags,
    data: '',
  });

  // Wait for the result to be available
  await new Promise((r) => setTimeout(r, 6000));

  const res = await result({
    process: cfg.ESCROW_PROCESS_ID,
    message: msgId,
  });

  if (res.Messages && res.Messages.length > 0) {
    try {
      const data = JSON.parse(res.Messages[0].Data);
      if (data.entries && data.entries.length > 0) {
        console.log('Received token credits for your wallet:');
        data.entries.forEach((e) => {
          console.log(
            `- Token: ${e.token}\n  Address: ${e.address}\n  Amount: ${e.amount}`
          );
        });
      } else {
        console.log('No credits found for this wallet address.');
      }
    } catch (e) {
      console.error('Could not parse response:', res.Messages[0].Data);
    }
  } else {
    console.log('No response or messages from escrow process.');
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
