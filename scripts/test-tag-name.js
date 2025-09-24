import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = 'amount-test-' + Date.now();
  const amount = '1';

  console.log('Testing different tag name (amountValue instead of amount):');

  // Try with a different tag name
  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
    { name: 'amountValue', value: amount }, // Different tag name
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
