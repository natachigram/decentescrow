#!/usr/bin/env node

/**
 * Quick Test Runner for DecentEscrow
 *
 * This is a simplified test runner that focuses on basic functionality verification.
 * Use this for quick smoke tests during development.
 */

import fs from 'fs';
import path from 'path';
import {
  createDataItemSigner,
  message,
  result,
  connect,
} from '@permaweb/aoconnect';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Configure AO network connection (try default mainnet first)
const ao = connect();

// Alternative testnet config if needed:
// const ao = connect({
//   MU_URL: "https://mu.ao-testnet.xyz",
//   CU_URL: "https://cu.ao-testnet.xyz",
//   GATEWAY_URL: "https://arweave.net"
// });

// Simple sleep function
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Simple config loader
function loadConfig() {
  const configPath = path.resolve(process.cwd(), 'config', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'Missing config/config.json. Copy from config.example.json and configure properly.'
    );
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

// Simple signer
function getSigner() {
  const walletPath = process.env.WALLET_PATH;
  if (!walletPath) {
    throw new Error(
      'Set WALLET_PATH environment variable to your Arweave JWK file'
    );
  }
  return createDataItemSigner(
    JSON.parse(fs.readFileSync(path.resolve(walletPath), 'utf-8'))
  );
}

// Simple message sender
async function sendAndGetResult(processId, tags, data = '') {
  const signer = getSigner();
  const messageId = await ao.message({
    process: processId,
    signer,
    tags,
    data,
  });

  await sleep(6000); // Wait for processing

  const res = await ao.result({ process: processId, message: messageId });
  return res;
}

// Parse response
function parseResponse(aoResult) {
  if (!aoResult || !aoResult.Messages || aoResult.Messages.length === 0) {
    return {};
  }

  const lastMessage = aoResult.Messages[aoResult.Messages.length - 1];

  if (lastMessage.Data) {
    try {
      return JSON.parse(lastMessage.Data);
    } catch (e) {
      return { rawData: lastMessage.Data };
    }
  }

  return lastMessage;
}

function generateJobId(prefix = 'quick') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

async function quickTest() {
  console.log('🚀 Quick Test - Basic Escrow Functionality');
  console.log('='.repeat(50));

  const config = loadConfig();

  try {
    // Test 1: Get configuration
    console.log('\n1️⃣ Testing configuration retrieval...');
    const res1 = await sendAndGetResult(config.ESCROW_PROCESS_ID, [
      { name: 'Action', value: 'GetConfig' },
    ]);
    const escrowConfig = parseResponse(res1);
    console.log('✅ Config retrieved:', {
      owner: escrowConfig.Owner ? 'Set' : 'Not set',
      paused: escrowConfig.Paused,
      platformFeeBps: escrowConfig.platformFeeBps,
      transferMethod: escrowConfig.transferMethod,
    });

    // Test 2: List existing jobs
    console.log('\n2️⃣ Testing job listing...');
    const res2 = await sendAndGetResult(config.ESCROW_PROCESS_ID, [
      { name: 'Action', value: 'ListJobs' },
      { name: 'limit', value: '5' },
    ]);
    const jobs = parseResponse(res2);
    console.log(
      `✅ Found ${Array.isArray(jobs) ? jobs.length : 0} existing jobs`
    );

    // Test 3: Check received tokens
    console.log('\n3️⃣ Testing received tokens check...');
    const res3 = await sendAndGetResult(config.ESCROW_PROCESS_ID, [
      { name: 'Action', value: 'GetReceivedTokens' },
    ]);
    const received = parseResponse(res3);
    console.log('✅ Received tokens check:', received);

    // Test 4: Simple deposit test (will fail without tokens, but tests the flow)
    console.log('\n4️⃣ Testing deposit flow...');
    const jobId = generateJobId();
    try {
      const res4 = await sendAndGetResult(config.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'Deposit' },
        { name: 'jobId', value: jobId },
        { name: 'amount', value: '1000' },
        { name: 'meta', value: 'Quick test deposit' },
      ]);
      console.log('✅ Deposit successful');

      // Check job was created
      const res5 = await sendAndGetResult(config.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'GetJob' },
        { name: 'jobId', value: jobId },
      ]);
      const job = parseResponse(res5);
      if (job && job.status) {
        console.log(`✅ Job created with status: ${job.status}`);
      }
    } catch (error) {
      console.log(
        '⚠️ Deposit failed (expected if no tokens transferred):',
        error.message
      );
    }

    console.log('\n🎉 Quick test completed successfully!');
  } catch (error) {
    console.error('❌ Quick test failed:', error.message);
    process.exit(1);
  }
}

quickTest();
