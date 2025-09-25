#!/usr/bin/env node

/**
 * robustJobDeposit.js
 *
 * 1. Checks available credits via GetReceivedTokens
 * 2. If sufficient, sends Deposit with unique jobId
 * 3. Fetches and prints job details
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

function randomJobId() {
  return 'job-' + Date.now() + '-' + Math.floor(Math.random() * 1e5);
}

async function main() {
  const wallet = getWallet();
  const signer = createDataItemSigner(wallet);
  const amount = process.argv[2] || '10000';
  const jobId = process.argv[3] || randomJobId();

  // 1. Check available credits
  const tagsCheck = [
    { name: 'Action', value: 'GetReceivedTokens' },
    { name: 'addr', value: WALLET_ADDRESS },
  ];
  const msgIdCheck = await message({
    process: ESCROW_PROCESS_ID,
    signer,
    tags: tagsCheck,
    data: '',
  });
  await new Promise((r) => setTimeout(r, 8000));
  const resCheck = await result({
    process: ESCROW_PROCESS_ID,
    message: msgIdCheck,
  });
  let available = '0';
  if (resCheck.Messages && resCheck.Messages.length > 0) {
    try {
      const data = JSON.parse(resCheck.Messages[0].Data);
      available = data.available || '0';
      console.log('Available credits:', available);
    } catch (e) {
      console.error(
        'Could not parse GetReceivedTokens response:',
        resCheck.Messages[0].Data
      );
      process.exit(1);
    }
  } else {
    console.error('No response from GetReceivedTokens.');
    process.exit(1);
  }
  if (BigInt(available) < BigInt(amount)) {
    console.error(`Insufficient credits: need ${amount}, have ${available}`);
    process.exit(1);
  }

  // 2. Send Deposit
  const tagsDeposit = [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'amount', value: amount },
    { name: 'meta', value: 'robustJobDeposit' },
  ];
  const msgIdDeposit = await message({
    process: ESCROW_PROCESS_ID,
    signer,
    tags: tagsDeposit,
    data: '',
  });
  console.log('Deposit message sent. Message ID:', msgIdDeposit);
  await new Promise((r) => setTimeout(r, 8000));
  const resDeposit = await result({
    process: ESCROW_PROCESS_ID,
    message: msgIdDeposit,
  });
  if (resDeposit.Error) {
    console.error('Deposit failed:', resDeposit.Error);
    process.exit(1);
  }
  console.log('Deposit result:', resDeposit);

  // 3. Fetch job details
  const tagsJob = [
    { name: 'Action', value: 'GetJob' },
    { name: 'jobId', value: jobId },
  ];
  const msgIdJob = await message({
    process: ESCROW_PROCESS_ID,
    signer,
    tags: tagsJob,
    data: '',
  });
  await new Promise((r) => setTimeout(r, 6000));
  const resJob = await result({
    process: ESCROW_PROCESS_ID,
    message: msgIdJob,
  });
  if (resJob.Messages && resJob.Messages.length > 0) {
    try {
      const job = JSON.parse(resJob.Messages[0].Data);
      console.log('Job details:', job);
    } catch (e) {
      console.error('Could not parse job details:', resJob.Messages[0].Data);
    }
  } else {
    console.log('No response for GetJob.');
  }
}

main().catch((e) => {
  console.error('Fatal:', e);
  process.exit(1);
});
