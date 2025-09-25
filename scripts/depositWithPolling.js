#!/usr/bin/env node

/**
 * depositWithPolling.js
 *
 * Robust deposit flow:
 * 1. Transfer tokens to escrow
 * 2. Poll GetReceivedTokens until sufficient amount observed (or timeout)
 * 3. Perform Deposit
 * 4. Output job record
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

function getSigner() {
  const walletPath = process.env.WALLET_PATH;
  if (!walletPath) throw new Error('WALLET_PATH env var not set');
  return createDataItemSigner(
    JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'))
  );
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function sendAndAwait(processId, tags, signer, waitMs = 7000) {
  const msgId = await message({ process: processId, signer, tags, data: '' });
  await sleep(waitMs);
  const res = await result({ process: processId, message: msgId });
  return { msgId, res };
}

async function pollReceived(
  escrowPid,
  signer,
  required,
  maxAttempts = 30, // Increased attempts
  intervalMs = 6000, // Increased interval
  token = null
) {
  for (let i = 0; i < maxAttempts; i++) {
    // Only send Action=GetReceivedTokens, no addr tag, so msg.From is used
    const tags = [{ name: 'Action', value: 'GetReceivedTokens' }];
    if (token) tags.push({ name: 'token', value: token });
    const { msgId, res } = await sendAndAwait(escrowPid, tags, signer, 3500);
    if (res.Messages && res.Messages.length > 0) {
      try {
        const data = JSON.parse(res.Messages[0].Data);
        const avail = data.available || '0';
        if (/^\d+$/.test(avail) && BigInt(avail) >= BigInt(required)) {
          return { available: avail, attempts: i + 1 };
        }
        console.log(` ⏳ Poll ${i + 1}: available=${avail} need=${required}`);
      } catch (_) {}
    }
    await sleep(intervalMs);
  }
  throw new Error('Timeout waiting for received tokens');
}

function randomJobId() {
  return 'job-' + Date.now() + '-' + Math.floor(Math.random() * 1e5);
}

async function main() {
  const cfg = loadConfig();
  const signer = getSigner();

  // Print wallet address for debug
  const walletPath = process.env.WALLET_PATH;
  const wallet = JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'));
  let address;
  if (wallet.n) {
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
    address = '[unknown]';
  }
  console.log('Using wallet address:', address);

  const amount = process.argv[2] || '10000';
  const jobId = process.argv[3] || randomJobId();

  console.log(
    `Starting robust deposit flow for jobId=${jobId} amount=${amount}`
  );
  console.log('1) Transfer tokens to escrow');
  await sendAndAwait(
    cfg.TOKEN_PROCESS_ID,
    [
      { name: 'Action', value: 'Transfer' },
      { name: 'Recipient', value: cfg.ESCROW_PROCESS_ID },
      { name: 'Quantity', value: amount },
    ],
    signer,
    9000
  );

  console.log('2) Polling for Credit-Notice acknowledgements...');
  const { available, attempts } = await pollReceived(
    cfg.ESCROW_PROCESS_ID,
    signer,
    amount
  );
  console.log(`   ✅ Tokens observed after ${attempts} poll(s): ${available}`);

  console.log('3) Performing Deposit');
  const { res: depRes, msgId: depMsg } = await sendAndAwait(
    cfg.ESCROW_PROCESS_ID,
    [
      { name: 'Action', value: 'Deposit' },
      { name: 'jobId', value: jobId },
      { name: 'amount', value: amount },
      { name: 'meta', value: 'robust-flow' },
    ],
    signer,
    9000
  );

  if (depRes.Error) {
    console.error('❌ Deposit failed:', depRes.Error.split('\n')[0]);
    console.error('Review recent DepositFailed events for details.');
    process.exit(1);
  }
  console.log(`   ✅ Deposit message ${depMsg}`);

  console.log('4) Fetching job record');
  const { res: jobRes } = await sendAndAwait(
    cfg.ESCROW_PROCESS_ID,
    [
      { name: 'Action', value: 'GetJob' },
      { name: 'jobId', value: jobId },
    ],
    signer,
    5000
  );
  if (jobRes.Messages && jobRes.Messages[0]) {
    try {
      console.log('Job:', jobRes.Messages[0].Data);
    } catch (_) {}
  }
  console.log('🎉 Flow complete');
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
