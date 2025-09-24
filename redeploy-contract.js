#!/usr/bin/env node

/**
 * Redeploy DecentEscrow Contract
 *
 * This script redeploys the escrow contract to fix the handler issues
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
  console.log('🚀 Redeploying DecentEscrow Contract');
  console.log('='.repeat(40));

  const config = loadConfig();
  const signer = getSigner();

  try {
    // Load the contract source
    const contractPath = path.resolve(process.cwd(), 'ao', 'escrow.lua');
    const contractSource = fs.readFileSync(contractPath, 'utf-8');

    console.log('📄 Contract source loaded');
    console.log(`   Size: ${contractSource.length} characters`);

    // Deploy the contract using AO spawn
    console.log('\n🔨 Deploying contract...');

    const deployMessageId = await message({
      process: 'xvK8PAH6ciL7SCVlrd2RlFTLtRv5wKJh7Vd7JG3xhDI', // AO Scheduler
      signer,
      tags: [
        { name: 'Action', value: 'Eval' },
        {
          name: 'Module',
          value:
            'XM2tB9o9pD8z3Wv1nQ2k4e6r8t0y2u4i6o8p0a2s4d6f8g0h2j4k6l8m0n2p4r6t8v0x2z4',
        }, // AOS Module
        {
          name: 'Scheduler',
          value: 'TZ7o5w3_3sx1KHP4-XrcNTN5qvqmYVR1MfGmGcQc8U',
        }, // AOS Scheduler
        { name: 'Data-Protocol', value: 'ao' },
        { name: 'Variant', value: 'ao.TN.1' },
        { name: 'Type', value: 'Message' },
        {
          name: 'From-Process',
          value: 'xvK8PAH6ciL7SCVlrd2RlFTLtRv5wKJh7Vd7JG3xhDI',
        },
        {
          name: 'From-Module',
          value:
            'XM2tB9o9pD8z3Wv1nQ2k4e6r8t0y2u4i6o8p0a2s4d6f8g0h2j4k6l8m0n2p4r6t8v0x2z4',
        },
      ],
      data: contractSource,
    });

    console.log('📤 Deployment message sent');
    console.log(`   Message ID: ${deployMessageId}`);

    // Wait for deployment to complete
    console.log('\n⏳ Waiting for deployment to complete...');
    await sleep(15000); // Wait 15 seconds for deployment

    // Try to get the result to see if deployment succeeded
    const deployResult = await result({
      process: 'xvK8PAH6ciL7SCVlrd2RlFTLtRv5wKJh7Vd7JG3xhDI',
      message: deployMessageId,
    });

    if (deployResult.Error) {
      console.log('❌ Deployment failed:');
      console.log(deployResult.Error);
      return;
    }

    // Extract the new process ID from the result
    let newProcessId = null;
    if (deployResult.Messages && deployResult.Messages.length > 0) {
      // Look for the process ID in the response
      const spawnMessage = deployResult.Messages.find((msg) =>
        msg.Tags?.some((tag) => tag.name === 'Action' && tag.value === 'Spawn')
      );

      if (spawnMessage) {
        newProcessId = spawnMessage.Target || spawnMessage.Data;
        console.log(`✅ Contract deployed successfully!`);
        console.log(`   New Process ID: ${newProcessId}`);
      }
    }

    if (!newProcessId) {
      console.log(
        '⚠️  Deployment may have succeeded but process ID not found in response'
      );
      console.log('   Check your AO wallet/explorer for the new process');
      return;
    }

    // Update the config with the new process ID
    console.log('\n📝 Updating configuration...');
    const updatedConfig = {
      ...config,
      ESCROW_PROCESS_ID: newProcessId,
    };

    fs.writeFileSync(
      path.resolve(process.cwd(), 'config', 'config.json'),
      JSON.stringify(updatedConfig, null, 2)
    );

    console.log('✅ Configuration updated');

    // Bootstrap the new contract
    console.log('\n🔧 Bootstrapping new contract...');

    // 1. Init owner
    await message({
      process: newProcessId,
      signer,
      tags: [{ name: 'Action', value: 'InitOwner' }],
      data: '',
    });

    await sleep(5000);

    // 2. Set default token
    await message({
      process: newProcessId,
      signer,
      tags: [
        { name: 'Action', value: 'SetDefaultToken' },
        { name: 'token', value: config.TOKEN_PROCESS_ID },
      ],
      data: '',
    });

    await sleep(5000);

    // 3. Set platform config
    const configTags = [{ name: 'Action', value: 'SetConfig' }];
    if (config.PLATFORM_FEE_BPS) {
      configTags.push({
        name: 'platformFeeBps',
        value: String(config.PLATFORM_FEE_BPS),
      });
    }
    if (config.PLATFORM_TREASURY) {
      configTags.push({
        name: 'platformTreasury',
        value: config.PLATFORM_TREASURY,
      });
    }
    if (config.ARBITER) {
      configTags.push({ name: 'arbiter', value: config.ARBITER });
    }

    if (configTags.length > 1) {
      await message({
        process: newProcessId,
        signer,
        tags: configTags,
        data: '',
      });
      await sleep(5000);
    }

    console.log('✅ Bootstrap complete');

    // Test the deployment
    console.log('\n🧪 Testing deployment...');

    const testMessageId = await message({
      process: newProcessId,
      signer,
      tags: [{ name: 'Action', value: 'GetConfig' }],
      data: '',
    });

    await sleep(8000);

    const testResult = await result({
      process: newProcessId,
      message: testMessageId,
    });

    if (testResult.Error) {
      console.log('❌ Test failed:', testResult.Error);
    } else {
      console.log('✅ Deployment test successful!');
      console.log('\n🎉 Contract redeployed and ready!');
      console.log(`   Process ID: ${newProcessId}`);
      console.log('   Run tests with: npm test');
    }
  } catch (error) {
    console.error('❌ Redeployment failed:', error.message);
    console.log('\n💡 Alternative: Deploy manually using AOS CLI:');
    console.log('   1. Start AOS: aos');
    console.log('   2. Load contract: .load ao/escrow.lua');
    console.log('   3. Update config.json with new process ID');
  }
}

main();
