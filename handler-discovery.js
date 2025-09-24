#!/usr/bin/env node

/**
 * Handler Discovery
 *
 * Test what handlers are actually available in the deployed contract
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

async function testHandler(config, signer, action, extraTags = []) {
  console.log(`\n🧪 Testing handler: ${action}`);

  try {
    const tags = [{ name: 'Action', value: action }, ...extraTags];

    const messageId = await message({
      process: config.ESCROW_PROCESS_ID,
      signer,
      tags,
      data: '',
    });

    await sleep(8000);

    const res = await result({
      process: config.ESCROW_PROCESS_ID,
      message: messageId,
    });

    if (res.Error) {
      console.log(`❌ ${action}: ${res.Error.split('\n')[0]}`);
      return false;
    } else if (res.Messages && res.Messages.length > 0) {
      console.log(`✅ ${action}: Working`);
      return true;
    } else {
      console.log(`🤔 ${action}: No clear result`);
      return false;
    }
  } catch (error) {
    console.log(`❌ ${action}: Exception - ${error.message}`);
    return false;
  }
}

async function main() {
  console.log('🔍 Handler Discovery');
  console.log('='.repeat(25));

  const config = loadConfig();
  const signer = getSigner();

  // Test all the handlers we expect to be available
  const handlersToTest = [
    ['GetConfig', []],
    ['ListJobs', []],
    ['GetPendingBalances', []],
    ['GetReceivedTokens', []],
    [
      'Deposit',
      [
        { name: 'jobId', value: 'test' },
        { name: 'amount', value: '1' },
      ],
    ],
    [
      'AssignFreelancer',
      [
        { name: 'jobId', value: 'test' },
        { name: 'freelancer', value: 'TEST_ADDR' },
      ],
    ],
    ['SubmitWork', [{ name: 'jobId', value: 'test' }]],
    ['ApproveWork', [{ name: 'jobId', value: 'test' }]],
    ['RequestRefund', [{ name: 'jobId', value: 'test' }]],
    ['CancelJob', [{ name: 'jobId', value: 'test' }]],
    ['InitOwner', []],
    ['SetConfig', []],
    ['Pause', []],
    ['Unpause', []],
  ];

  const workingHandlers = [];
  const failingHandlers = [];

  for (const [handler, extraTags] of handlersToTest) {
    const works = await testHandler(config, signer, handler, extraTags);
    if (works) {
      workingHandlers.push(handler);
    } else {
      failingHandlers.push(handler);
    }
    await sleep(2000); // Small delay between tests
  }

  console.log('\n📊 Handler Summary:');
  console.log('='.repeat(25));
  console.log(`✅ Working handlers (${workingHandlers.length}):`);
  workingHandlers.forEach((h) => console.log(`   - ${h}`));

  console.log(`\n❌ Failing handlers (${failingHandlers.length}):`);
  failingHandlers.forEach((h) => console.log(`   - ${h}`));

  // Special focus on Deposit handler
  if (failingHandlers.includes('Deposit')) {
    console.log('\n🔍 Deposit Handler Analysis:');
    console.log('The Deposit handler is failing consistently.');
    console.log('This suggests either:');
    console.log('1. The Deposit handler was not deployed properly');
    console.log('2. There is a bug in the deployed Deposit handler code');
    console.log(
      '3. The Deposit handler has a different interface than expected'
    );
    console.log(
      '\n💡 Recommendation: Redeploy the contract or check deployment logs'
    );
  }
}

main();
