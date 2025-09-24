#!/usr/bin/env node

/**
 * Quick Deposit Test with Fixes
 *
 * Test the fixed deposit functionality without running the full suite
 */

import fs from 'fs';
import path from 'path';
import { createDataItemSigner, message, result } from '@permaweb/aoconnect';
import dotenv from 'dotenv';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

function loadConfig() {
  const configPath = path.resolve(process.cwd(), 'config', 'config.json');
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

function getSigner() {
  const walletPath = process.env.WALLET_PATH;
  return createDataItemSigner(
    JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'))
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🧪 Quick Deposit Test with Fixes');
  console.log('='.repeat(35));

  const config = loadConfig();
  const signer = getSigner();

  try {
    const uniqueJobId = `fixed-test-${Date.now()}`;

    console.log('\n1. Transferring tokens to escrow...');
    const transferMessageId = await message({
      process: config.TOKEN_PROCESS_ID,
      signer,
      tags: [
        { name: 'Action', value: 'Transfer' },
        { name: 'Recipient', value: config.ESCROW_PROCESS_ID },
        { name: 'Quantity', value: '15000' },
      ],
      data: '',
    });

    console.log('Transfer sent, waiting for Credit-Notice...');
    await sleep(12000); // Wait for Credit-Notice

    console.log('\n2. Creating deposit with correct lowercase tags...');
    const depositMessageId = await message({
      process: config.ESCROW_PROCESS_ID,
      signer,
      tags: [
        { name: 'Action', value: 'Deposit' },
        { name: 'jobId', value: uniqueJobId }, // lowercase ✓
        { name: 'amount', value: '10000' }, // lowercase ✓
        { name: 'meta', value: 'Fixed deposit test' }, // using 'meta' ✓
      ],
      data: '',
    });

    console.log('Deposit sent, waiting for result...');
    await sleep(10000);

    const depositResult = await result({
      process: config.ESCROW_PROCESS_ID,
      message: depositMessageId,
    });

    if (depositResult.Error) {
      console.log('❌ Deposit still failing:');
      console.log(depositResult.Error);
    } else if (depositResult.Messages && depositResult.Messages.length > 0) {
      console.log('✅ SUCCESS! Deposit worked with fixes!');
      console.log('Response:', depositResult.Messages[0].Data);

      console.log('\n3. Verifying job was created...');
      await sleep(3000);

      const listMessageId = await message({
        process: config.ESCROW_PROCESS_ID,
        signer,
        tags: [{ name: 'Action', value: 'ListJobs' }],
        data: '',
      });

      await sleep(8000);

      const listResult = await result({
        process: config.ESCROW_PROCESS_ID,
        message: listMessageId,
      });

      if (listResult.Messages && listResult.Messages.length > 0) {
        const jobsData = JSON.parse(listResult.Messages[0].Data);
        const ourJob = jobsData.jobs?.find((j) => j.jobId === uniqueJobId);
        if (ourJob) {
          console.log('✅ Job created successfully:');
          console.log(`  - Job ID: ${ourJob.jobId}`);
          console.log(`  - Status: ${ourJob.status}`);
          console.log(`  - Amount: ${ourJob.amount}`);
          console.log(`  - Client: ${ourJob.client}`);

          console.log('\n🎉 ALL FIXES WORKING! Ready for comprehensive tests.');
        }
      }
    } else {
      console.log('🤔 No clear result from deposit');
    }
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    if (error.message.includes('Rate limit')) {
      console.log(
        '💡 Tip: Wait a few minutes and try again to avoid rate limits'
      );
    }
  }
}

main();
