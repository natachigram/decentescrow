import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = 'data-test-' + Date.now();
  const amount = '1';

  console.log(
    'Testing with amount in Data field AND as a custom parsing approach:'
  );

  // Send with amount both as tag AND in a format that might work
  await send(
    cfg.ESCROW_PROCESS_ID,
    [
      { name: 'Action', value: 'Deposit' },
      { name: 'jobId', value: jobId },
      { name: 'token', value: cfg.TOKEN_PROCESS_ID },
      { name: 'amount', value: amount },
      // Try adding it with different case
      { name: 'Amount', value: amount },
    ],
    JSON.stringify({
      jobId: jobId,
      amount: amount,
      token: cfg.TOKEN_PROCESS_ID,
    })
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
