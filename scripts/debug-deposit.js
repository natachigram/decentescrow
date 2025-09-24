import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = 'debug-test-' + Date.now();
  const amount = '1';

  console.log('Sending with tags:');
  console.log('- Action: Deposit');
  console.log('- jobId:', jobId);
  console.log('- token:', cfg.TOKEN_PROCESS_ID);
  console.log('- amount:', amount);

  // Send with explicit debugging
  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
    { name: 'amount', value: amount },
    { name: 'debug', value: 'test-amount-validation' },
  ], JSON.stringify({
    amount: amount,
    debug: 'amount-in-data-field'
  }));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});