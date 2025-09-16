import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = process.env.JOB_ID || 'job-1';
  const amount = process.env.AMOUNT || '0';
  if (!cfg.CLIENT_ADDRESS) throw new Error('Set CLIENT_ADDRESS in config');
  if (!cfg.TOKEN_PROCESS_ID || !cfg.ESCROW_PROCESS_ID)
    throw new Error('Missing TOKEN_PROCESS_ID or ESCROW_PROCESS_ID in config');
  if (amount === '0') throw new Error('Provide AMOUNT env (smallest unit)');
  const meta = process.env.META; // optional string (<= 2048 chars)

  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
    { name: 'amount', value: String(amount) },
    ...(meta ? [{ name: 'meta', value: meta }] : []),
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
