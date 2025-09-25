#!/usr/bin/env node

/**
 * sendTokenTransfer.js
 *
 * Sends a Transfer message from your wallet to the escrow process using the token process ID in config.
 * Prints the message ID so you can track the result and emitted notices.
 *
 * Usage:
 *   node scripts/sendTokenTransfer.js <amount>
 *   (amount defaults to 10000 if not provided)
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createDataItemSigner, message } from '@permaweb/aoconnect';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function loadConfig() {
  return JSON.parse(
    fs.readFileSync(path.resolve('config', 'config.json'), 'utf-8')
  );
}

function getSigner() {
  const walletPath = process.env.WALLET_PATH;
  if (!walletPath) throw new Error('WALLET_PATH env var not set');
  return createDataItemSigner(
    JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'))
  );
}

async function main() {
  const cfg = loadConfig();
  const signer = getSigner();
  const amount = process.argv[2] || '10000';

  if (!cfg.TOKEN_PROCESS_ID || !cfg.ESCROW_PROCESS_ID) {
    throw new Error('TOKEN_PROCESS_ID or ESCROW_PROCESS_ID missing in config');
  }

  console.log(
    `Sending Transfer of ${amount} tokens to escrow process ${cfg.ESCROW_PROCESS_ID} via token process ${cfg.TOKEN_PROCESS_ID}`
  );

  const tags = [
    { name: 'Action', value: 'Transfer' },
    { name: 'Recipient', value: cfg.ESCROW_PROCESS_ID },
    { name: 'Quantity', value: amount },
  ];

  const msgId = await message({
    process: cfg.TOKEN_PROCESS_ID,
    signer,
    tags,
    data: '',
  });

  console.log('Transfer message sent!');
  console.log('Message ID:', msgId);
  console.log(
    'You can now check the escrow process for any Credit-Notice or related events.'
  );
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
