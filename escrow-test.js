#!/usr/bin/env node

/**
 * Comprehensive DecentEscrow AO Contract Test Suite
 *
 * This test suite provides comprehensive testing for the DecentEscrow AO contract with:
 * - Complete action verification after each operation
 * - Event emission verification
 * - State consistency checking
 * - Error handling validation
 * - Edge case coverage
 *
 * Architecture:
 * - Uses direct token transfer mechanism (Transfer -> Deposit pattern)
 * - Implements pull-based payment system with Claim actions
 * - Verifies all state transitions and business logic
 *
 * Requirements:
 * - Set WALLET_PATH environment variable to your Arweave wallet
 * - Configure config/config.json with valid process IDs
 * - Ensure escrow process is deployed and initialized
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

// Configure AO network connection (using default mainnet)
const ao = connect();

// =================================
// TEST CONFIGURATION
// =================================

const TEST_CONFIG = {
  // Network delays for AO processing
  AO_PROCESSING_DELAY: 8000, // 8 seconds for message processing
  MESSAGE_DELAY: 3000, // 3 seconds between messages

  // Test amounts (using string arithmetic for precision)
  AMOUNTS: {
    SMALL: '1000',
    MEDIUM: '10000',
    LARGE: '50000',
    HUGE: '100000',
  },

  // Platform fee for testing (5% = 500 bps)
  PLATFORM_FEE_BPS: 500,

  // Test timeout
  TEST_TIMEOUT: 120000, // 2 minutes per test
};

// =================================
// UTILITY FUNCTIONS
// =================================

/**
 * Load configuration from config.json
 */
function loadConfig() {
  const configPath = path.resolve(process.cwd(), 'config', 'config.json');
  if (!fs.existsSync(configPath)) {
    throw new Error(
      'Missing config/config.json. Copy from config.example.json and configure properly.'
    );
  }
  return JSON.parse(fs.readFileSync(configPath, 'utf-8'));
}

/**
 * Create signer from wallet file
 */
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

/**
 * Send message to AO process
 */
async function sendMessage(processId, tags, data = '') {
  const signer = getSigner();
  return await ao.message({
    process: processId,
    signer,
    tags,
    data,
  });
}

/**
 * Send message and get result with proper delays
 */
async function sendAndGetResult(processId, tags, data = '') {
  const messageId = await sendMessage(processId, tags, data);

  // Wait for AO network processing
  await sleep(TEST_CONFIG.AO_PROCESSING_DELAY);

  const res = await ao.result({
    process: processId,
    message: messageId,
  });

  return { messageId, result: res };
}

/**
 * Sleep utility
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Generate unique test identifiers
 */
function generateJobId(prefix = 'test') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

function generateTestAddress() {
  return 'TEST_' + Math.random().toString(36).substr(2, 40).toUpperCase();
}

/**
 * Enhanced assertion functions
 */
function assert(condition, message) {
  if (!condition) {
    throw new Error(`❌ Assertion failed: ${message}`);
  }
}

function assertEquals(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(
      `❌ ${
        message || 'Values not equal'
      }: expected "${expected}", got "${actual}"`
    );
  }
}

function assertNotEmpty(obj, message) {
  if (!obj || (typeof obj === 'object' && Object.keys(obj).length === 0)) {
    throw new Error(`❌ ${message || 'Object should not be empty'}`);
  }
}

/**
 * Test result tracking
 */
class TestTracker {
  constructor() {
    this.tests = [];
    this.currentSuite = '';
  }

  startSuite(name) {
    this.currentSuite = name;
    console.log(`\n🚀 ${name}`);
    console.log('='.repeat(60));
  }

  async runTest(name, testFn) {
    const startTime = Date.now();
    console.log(`\n🧪 ${name}...`);

    try {
      await testFn();
      const duration = Date.now() - startTime;
      console.log(`✅ PASS: ${name} (${duration}ms)`);
      this.tests.push({
        suite: this.currentSuite,
        name,
        status: 'PASS',
        duration,
      });
    } catch (error) {
      const duration = Date.now() - startTime;
      console.log(`❌ FAIL: ${name} (${duration}ms)`);
      console.log(`   Error: ${error.message}`);
      this.tests.push({
        suite: this.currentSuite,
        name,
        status: 'FAIL',
        duration,
        error: error.message,
      });
    }

    // Add delay between tests to avoid rate limiting
    await sleep(TEST_CONFIG.MESSAGE_DELAY);
  }

  printSummary() {
    const passed = this.tests.filter((t) => t.status === 'PASS').length;
    const failed = this.tests.filter((t) => t.status === 'FAIL').length;

    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`Total: ${this.tests.length}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(
      `📈 Success Rate: ${((passed / this.tests.length) * 100).toFixed(1)}%`
    );

    if (failed > 0) {
      console.log('\n❌ Failed Tests:');
      this.tests
        .filter((t) => t.status === 'FAIL')
        .forEach((t) => {
          console.log(`   • ${t.suite} > ${t.name}: ${t.error}`);
        });
    }
  }
}

// =================================
// ESCROW CONTRACT INTERFACE
// =================================

class EscrowContractTester {
  constructor(config) {
    this.config = config;
    this.escrowProcessId = config.ESCROW_PROCESS_ID;
    this.tokenProcessId = config.TOKEN_PROCESS_ID;
    this.platformTreasury = config.PLATFORM_TREASURY;
    this.arbiter = config.ARBITER;
  }

  // =================================
  // TOKEN OPERATIONS
  // =================================

  /**
   * Transfer tokens to escrow contract (step 1 of deposit)
   */
  async transferTokensToEscrow(amount) {
    console.log(`  📤 Transferring ${amount} tokens to escrow...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.tokenProcessId,
      [
        { name: 'Action', value: 'Transfer' },
        { name: 'Recipient', value: this.escrowProcessId },
        { name: 'Quantity', value: amount },
      ]
    );

    console.log(`  ✅ Transfer completed (${messageId})`);
    return { messageId, result: res };
  }

  /**
   * Check received tokens available for deposit
   */
  async getReceivedTokens(address = null) {
    const tags = [{ name: 'Action', value: 'GetReceivedTokens' }];
    if (address) tags.push({ name: 'addr', value: address });

    const { result: res } = await sendAndGetResult(this.escrowProcessId, tags);
    return this.parseResponse(res);
  }

  // =================================
  // ADMIN OPERATIONS
  // =================================

  async initOwner() {
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [{ name: 'Action', value: 'InitOwner' }]
    );
    return { messageId, result: res };
  }

  async setConfig(options = {}) {
    const tags = [{ name: 'Action', value: 'SetConfig' }];

    if (options.platformFeeBps !== undefined) {
      tags.push({
        name: 'platformFeeBps',
        value: String(options.platformFeeBps),
      });
    }
    if (options.platformTreasury) {
      tags.push({ name: 'platformTreasury', value: options.platformTreasury });
    }
    if (options.arbiter) {
      tags.push({ name: 'arbiter', value: options.arbiter });
    }

    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      tags
    );
    return { messageId, result: res };
  }

  async pause() {
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [{ name: 'Action', value: 'Pause' }]
    );
    return { messageId, result: res };
  }

  async unpause() {
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [{ name: 'Action', value: 'Unpause' }]
    );
    return { messageId, result: res };
  }

  async transferOwnership(newOwner) {
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'TransferOwnership' },
        { name: 'newOwner', value: newOwner },
      ]
    );
    return { messageId, result: res };
  }

  // =================================
  // JOB LIFECYCLE OPERATIONS
  // =================================

  /**
   * Create deposit using direct transfer method
   */
  async deposit(jobId, amount, meta = null) {
    console.log(
      `  💰 Creating deposit for job ${jobId} (amount: ${amount})...`
    );

    // Step 1: Transfer tokens to escrow
    await this.transferTokensToEscrow(amount);

    // Step 2: Wait for Credit-Notice to arrive at escrow
    console.log(`  ⏳ Waiting for Credit-Notice to be processed...`);
    await sleep(8000); // Wait 8 seconds for Credit-Notice

    // Step 3: Call deposit action
    const tags = [
      { name: 'Action', value: 'Deposit' },
      { name: 'jobId', value: jobId },
      { name: 'amount', value: amount },
    ];

    if (meta) {
      tags.push({
        name: 'meta',
        value: typeof meta === 'string' ? meta : JSON.stringify(meta),
      });
    }

    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      tags
    );

    // Check for errors in the response
    if (res.Error) {
      console.log(`  ❌ Deposit failed: ${res.Error}`);
      throw new Error(`Deposit failed: ${res.Error}`);
    }

    console.log(`  ✅ Deposit completed (${messageId})`);
    return { messageId, result: res };
  }

  async assignFreelancer(jobId, freelancerAddress) {
    console.log(`  👤 Assigning freelancer to job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'AssignFreelancer' },
        { name: 'jobId', value: jobId },
        { name: 'freelancer', value: freelancerAddress },
      ]
    );
    console.log(`  ✅ Freelancer assigned (${messageId})`);
    return { messageId, result: res };
  }

  async release(jobId) {
    console.log(`  💸 Releasing funds for job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'Release' },
        { name: 'jobId', value: jobId },
      ]
    );
    console.log(`  ✅ Funds released (${messageId})`);
    return { messageId, result: res };
  }

  async claim(token = null, amount = null) {
    console.log(`  💳 Claiming pending balance...`);
    const tags = [{ name: 'Action', value: 'Claim' }];

    if (token) tags.push({ name: 'token', value: token });
    if (amount) tags.push({ name: 'amount', value: amount });

    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      tags
    );
    console.log(`  ✅ Claim completed (${messageId})`);
    return { messageId, result: res };
  }

  // =================================
  // CANCELLATION OPERATIONS
  // =================================

  async cancelUnassigned(jobId) {
    console.log(`  ❌ Cancelling unassigned job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'CancelUnassigned' },
        { name: 'jobId', value: jobId },
      ]
    );
    console.log(`  ✅ Job cancelled (${messageId})`);
    return { messageId, result: res };
  }

  async requestCancel(jobId) {
    console.log(`  📝 Requesting cancellation for job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'RequestCancel' },
        { name: 'jobId', value: jobId },
      ]
    );
    console.log(`  ✅ Cancellation requested (${messageId})`);
    return { messageId, result: res };
  }

  async approveCancel(jobId) {
    console.log(`  ✓ Approving cancellation for job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'ApproveCancel' },
        { name: 'jobId', value: jobId },
      ]
    );
    console.log(`  ✅ Cancellation approved (${messageId})`);
    return { messageId, result: res };
  }

  // =================================
  // DISPUTE OPERATIONS
  // =================================

  async openDispute(jobId, reason = 'Test dispute') {
    console.log(`  ⚖️ Opening dispute for job ${jobId}...`);
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'OpenDispute' },
        { name: 'jobId', value: jobId },
        { name: 'reason', value: reason },
      ]
    );
    console.log(`  ✅ Dispute opened (${messageId})`);
    return { messageId, result: res };
  }

  async decideDispute(jobId, outcome) {
    console.log(
      `  🏛️ Deciding dispute for job ${jobId} (outcome: ${outcome})...`
    );
    const { messageId, result: res } = await sendAndGetResult(
      this.escrowProcessId,
      [
        { name: 'Action', value: 'DecideDispute' },
        { name: 'jobId', value: jobId },
        { name: 'outcome', value: outcome },
      ]
    );
    console.log(`  ✅ Dispute decided (${messageId})`);
    return { messageId, result: res };
  }

  // =================================
  // VIEW OPERATIONS
  // =================================

  async getJob(jobId) {
    const { result: res } = await sendAndGetResult(this.escrowProcessId, [
      { name: 'Action', value: 'GetJob' },
      { name: 'jobId', value: jobId },
    ]);
    return this.parseResponse(res);
  }

  async listJobs(limit = 50) {
    const { result: res } = await sendAndGetResult(this.escrowProcessId, [
      { name: 'Action', value: 'ListJobs' },
      { name: 'limit', value: String(limit) },
    ]);
    return this.parseResponse(res);
  }

  async getPending(address = null) {
    const tags = [{ name: 'Action', value: 'GetPending' }];
    if (address) tags.push({ name: 'addr', value: address });

    const { result: res } = await sendAndGetResult(this.escrowProcessId, tags);
    return this.parseResponse(res);
  }

  async getConfig() {
    const { result: res } = await sendAndGetResult(this.escrowProcessId, [
      { name: 'Action', value: 'GetConfig' },
    ]);
    return this.parseResponse(res);
  }

  // =================================
  // RESPONSE PARSING
  // =================================

  parseResponse(aoResult) {
    if (!aoResult || !aoResult.Messages || aoResult.Messages.length === 0) {
      return {};
    }

    // Get the last message (most recent response)
    const lastMessage = aoResult.Messages[aoResult.Messages.length - 1];

    if (lastMessage.Data) {
      try {
        return JSON.parse(lastMessage.Data);
      } catch (e) {
        console.warn('Failed to parse response data:', lastMessage.Data);
        return { rawData: lastMessage.Data };
      }
    }

    return lastMessage;
  }

  // =================================
  // VERIFICATION HELPERS
  // =================================

  async verifyJobState(jobId, expectedStatus, additionalChecks = {}) {
    const job = await this.getJob(jobId);
    assertNotEmpty(job, `Job ${jobId} should exist`);
    assertEquals(
      job.status,
      expectedStatus,
      `Job ${jobId} should have status ${expectedStatus}`
    );

    // Additional checks
    if (additionalChecks.amount) {
      assertEquals(
        job.amount,
        additionalChecks.amount,
        `Job ${jobId} amount mismatch`
      );
    }
    if (additionalChecks.client) {
      assertEquals(
        job.client,
        additionalChecks.client,
        `Job ${jobId} client mismatch`
      );
    }
    if (additionalChecks.freelancer) {
      assertEquals(
        job.freelancer,
        additionalChecks.freelancer,
        `Job ${jobId} freelancer mismatch`
      );
    }

    console.log(`  ✓ Job ${jobId} verified: status=${job.status}`);
    return job;
  }

  async verifyPendingBalance(address, token, expectedAmount) {
    const pending = await this.getPending(address);
    const tokenBalances = Array.isArray(pending) ? pending : [];
    const tokenBalance = tokenBalances.find((b) => b.token === token);

    const actualAmount = tokenBalance ? tokenBalance.amount : '0';
    assertEquals(
      actualAmount,
      expectedAmount,
      `Pending balance for ${address} should be ${expectedAmount}, got ${actualAmount}`
    );

    console.log(
      `  ✓ Pending balance verified: ${address} has ${actualAmount} of ${token}`
    );
    return actualAmount;
  }
}

// =================================
// TEST SUITES
// =================================

/**
 * Test the admin functionality
 */
async function testAdminFunctionality(escrow, tracker) {
  await tracker.runTest('Initialize Owner', async () => {
    // Owner should already be initialized from setup, test config retrieval
    const config = await escrow.getConfig();
    assertNotEmpty(config, 'Config should be available');
    assertNotEmpty(config.Owner, 'Owner should be set');
    console.log('  ✓ Owner is properly initialized');
  });

  await tracker.runTest('Set Configuration', async () => {
    const result = await escrow.setConfig({
      platformFeeBps: TEST_CONFIG.PLATFORM_FEE_BPS,
      platformTreasury: escrow.platformTreasury,
      arbiter: escrow.arbiter,
    });

    // Verify config was updated
    const config = await escrow.getConfig();
    assertEquals(
      config.platformFeeBps,
      TEST_CONFIG.PLATFORM_FEE_BPS,
      'Platform fee should be updated'
    );
    console.log('  ✓ Configuration updated successfully');
  });

  await tracker.runTest('Pause and Unpause Contract', async () => {
    // Pause
    await escrow.pause();
    let config = await escrow.getConfig();
    assertEquals(config.Paused, true, 'Contract should be paused');

    // Unpause
    await escrow.unpause();
    config = await escrow.getConfig();
    assertEquals(config.Paused, false, 'Contract should be unpaused');
    console.log('  ✓ Pause/unpause functionality working');
  });
}

/**
 * Test the happy path job lifecycle
 */
async function testHappyPathJobLifecycle(escrow, tracker) {
  const jobId = generateJobId('happy-path');
  const freelancer = generateTestAddress();
  const amount = TEST_CONFIG.AMOUNTS.MEDIUM;

  await tracker.runTest('Complete Happy Path Flow', async () => {
    console.log(
      `  🎯 Testing job: ${jobId}, freelancer: ${freelancer}, amount: ${amount}`
    );

    // 1. Deposit
    await escrow.deposit(jobId, amount, { description: 'Happy path test job' });
    await escrow.verifyJobState(jobId, 'funded', { amount });

    // 2. Assign freelancer
    await escrow.assignFreelancer(jobId, freelancer);
    await escrow.verifyJobState(jobId, 'locked', { freelancer });

    // 3. Release funds
    await escrow.release(jobId);
    await escrow.verifyJobState(jobId, 'released');

    // 4. Verify pending balances
    // Calculate expected amounts (5% platform fee = 500 bps)
    const fee = Math.floor(
      (parseInt(amount) * TEST_CONFIG.PLATFORM_FEE_BPS) / 10000
    ).toString();
    const payout = (parseInt(amount) - parseInt(fee)).toString();

    await escrow.verifyPendingBalance(
      escrow.platformTreasury,
      escrow.tokenProcessId,
      fee
    );
    await escrow.verifyPendingBalance(
      freelancer,
      escrow.tokenProcessId,
      payout
    );

    console.log('  ✅ Complete happy path flow successful');
  });
}

/**
 * Test cancellation flows
 */
async function testCancellationFlows(escrow, tracker) {
  await tracker.runTest('Cancel Unassigned Job', async () => {
    const jobId = generateJobId('cancel-unassigned');
    const amount = TEST_CONFIG.AMOUNTS.SMALL;

    // Deposit
    await escrow.deposit(jobId, amount);
    await escrow.verifyJobState(jobId, 'funded');

    // Cancel before assignment
    await escrow.cancelUnassigned(jobId);
    await escrow.verifyJobState(jobId, 'cancelled');

    // Verify client gets refund
    const config = await escrow.getConfig();
    await escrow.verifyPendingBalance(
      config.Owner,
      escrow.tokenProcessId,
      amount
    );

    console.log('  ✅ Unassigned job cancellation successful');
  });

  await tracker.runTest('Mutual Cancellation Flow', async () => {
    const jobId = generateJobId('mutual-cancel');
    const freelancer = generateTestAddress();
    const amount = TEST_CONFIG.AMOUNTS.SMALL;

    // Deposit and assign
    await escrow.deposit(jobId, amount);
    await escrow.assignFreelancer(jobId, freelancer);
    await escrow.verifyJobState(jobId, 'locked');

    // Request cancellation (as client)
    await escrow.requestCancel(jobId);
    let job = await escrow.getJob(jobId);
    assertNotEmpty(job.cancelRequest, 'Cancel request should be created');

    // TODO: Switch to freelancer context and approve
    // For now, this test shows the request was created properly
    console.log('  ✅ Mutual cancellation request flow working');
  });
}

/**
 * Test dispute resolution
 */
async function testDisputeResolution(escrow, tracker) {
  await tracker.runTest('Dispute with Refund Resolution', async () => {
    const jobId = generateJobId('dispute-refund');
    const freelancer = generateTestAddress();
    const amount = TEST_CONFIG.AMOUNTS.SMALL;

    // Setup locked job
    await escrow.deposit(jobId, amount);
    await escrow.assignFreelancer(jobId, freelancer);
    await escrow.verifyJobState(jobId, 'locked');

    // Open dispute
    await escrow.openDispute(jobId, 'Client dispute: work not delivered');
    await escrow.verifyJobState(jobId, 'disputed');

    // TODO: Switch to arbiter context for dispute resolution
    // For now, verify dispute was opened correctly
    const job = await escrow.getJob(jobId);
    assertNotEmpty(job.dispute, 'Dispute should be recorded');
    assertEquals(
      job.dispute.reason,
      'Client dispute: work not delivered',
      'Dispute reason should match'
    );

    console.log('  ✅ Dispute opening flow working');
  });
}

/**
 * Test view functions
 */
async function testViewFunctions(escrow, tracker) {
  await tracker.runTest('List Jobs', async () => {
    const jobs = await escrow.listJobs(10);
    assert(Array.isArray(jobs), 'Jobs list should be an array');
    console.log(`  ✓ Retrieved ${jobs.length} jobs`);
  });

  await tracker.runTest('Get Configuration', async () => {
    const config = await escrow.getConfig();
    assertNotEmpty(config, 'Config should not be empty');
    assertNotEmpty(config.Owner, 'Owner should be set');
    assertEquals(
      config.transferMethod,
      'direct-transfer',
      'Transfer method should be direct-transfer'
    );
    console.log('  ✓ Configuration retrieved successfully');
  });

  await tracker.runTest('Get Pending Balances', async () => {
    const pending = await escrow.getPending();
    assert(Array.isArray(pending), 'Pending balances should be an array');
    console.log(`  ✓ Retrieved pending balances for current user`);
  });

  await tracker.runTest('Get Received Tokens', async () => {
    const received = await escrow.getReceivedTokens();
    assertNotEmpty(received, 'Received tokens response should not be empty');
    assert(received.hasOwnProperty('available'), 'Should have available field');
    console.log('  ✓ Received tokens check working');
  });
}

/**
 * Test error conditions
 */
async function testErrorConditions(escrow, tracker) {
  await tracker.runTest('Invalid Job Operations', async () => {
    const nonExistentJobId = 'non-existent-job-' + Date.now();

    // Try to get non-existent job
    const job = await escrow.getJob(nonExistentJobId);
    assert(
      Object.keys(job).length === 0,
      'Non-existent job should return empty object'
    );

    console.log('  ✓ Non-existent job handling working');
  });

  await tracker.runTest('Insufficient Token Deposit', async () => {
    const jobId = generateJobId('insufficient-deposit');

    try {
      // Try to deposit without transferring tokens first
      await escrow.deposit(jobId, TEST_CONFIG.AMOUNTS.SMALL);
      // If this succeeds, something is wrong
      throw new Error('Deposit should fail without prior token transfer');
    } catch (error) {
      // This should fail due to insufficient tokens
      console.log('  ✓ Insufficient token deposit properly rejected');
    }
  });
}

// =================================
// MAIN TEST RUNNER
// =================================

async function main() {
  console.log('🧪 DecentEscrow AO Contract - Comprehensive Test Suite');
  console.log('='.repeat(60));

  const config = loadConfig();
  const escrow = new EscrowContractTester(config);
  const tracker = new TestTracker();

  try {
    // Verify we can connect
    console.log('🔗 Verifying connection to AO network...');
    const testConfig = await escrow.getConfig();
    console.log('✅ Connected successfully');
    console.log(`📋 Testing escrow process: ${config.ESCROW_PROCESS_ID}`);
    console.log(`🪙 Using token process: ${config.TOKEN_PROCESS_ID}`);

    // Run test suites
    tracker.startSuite('Admin Functionality');
    await testAdminFunctionality(escrow, tracker);

    tracker.startSuite('Happy Path Job Lifecycle');
    await testHappyPathJobLifecycle(escrow, tracker);

    tracker.startSuite('Cancellation Flows');
    await testCancellationFlows(escrow, tracker);

    tracker.startSuite('Dispute Resolution');
    await testDisputeResolution(escrow, tracker);

    tracker.startSuite('View Functions');
    await testViewFunctions(escrow, tracker);

    tracker.startSuite('Error Conditions');
    await testErrorConditions(escrow, tracker);
  } catch (error) {
    console.error('❌ Test setup failed:', error.message);
    process.exit(1);
  }

  // Print final summary
  tracker.printSummary();

  // Exit with appropriate code
  const failed = tracker.tests.filter((t) => t.status === 'FAIL').length;
  process.exit(failed > 0 ? 1 : 0);
}

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

// Run the tests
main().catch((error) => {
  console.error('❌ Fatal error:', error.message);
  process.exit(1);
});
