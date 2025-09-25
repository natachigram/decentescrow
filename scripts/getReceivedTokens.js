#!/usr/bin/env node

/**
 * getReceivedTokens.js
 *
 * Fetches and prints your available received tokens from the escrow process using GetReceivedTokens.
 * Usage:
 *   node scripts/getReceivedTokens.js
 */

import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { createDataItemSigner, message, result } from '@permaweb/aoconnect';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const ESCROW_PROCESS_ID = 'ktl0iPdM44_VfTAVF557vSqaF9AfUAFUKDDaQRWyjf0';
const WALLET_ADDRESS = 'GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU';

function getWallet() {
  const walletPath = process.env.WALLET_PATH;
  if (!walletPath) throw new Error('WALLET_PATH env var not set');
  return JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'));
}

async function main() {
  const wallet = getWallet();
  const signer = createDataItemSigner(wallet);

  const tags = [
    { name: 'Action', value: 'GetReceivedTokens' },
    { name: 'addr', value: WALLET_ADDRESS },
  ];

  const msgId = await message({
    process: ESCROW_PROCESS_ID,
    signer,
    tags,
    data: '',
  });

  console.log('Message ID:', msgId);
  await new Promise((r) => setTimeout(r, 8000));

  const res = await result({
    process: ESCROW_PROCESS_ID,
    message: msgId,
  });

  if (res.Messages && res.Messages.length > 0) {
    try {
      const data = JSON.parse(res.Messages[0].Data);
      console.log('GetReceivedTokens result:', data);
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
