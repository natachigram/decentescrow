import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = process.env.JOB_ID || 'job-1';
  const amount = process.env.AMOUNT || '0';
  if (!cfg.CLIENT_ADDRESS || !cfg.FREELANCER_ADDRESS)
    throw new Error('Set CLIENT_ADDRESS and FREELANCER_ADDRESS in config');
  if (!cfg.TOKEN_PROCESS_ID || !cfg.ESCROW_PROCESS_ID)
    throw new Error('Missing TOKEN_PROCESS_ID or ESCROW_PROCESS_ID in config');
  if (amount === '0') throw new Error('Provide AMOUNT env (smallest unit)');

  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'client', value: cfg.CLIENT_ADDRESS },
    { name: 'freelancer', value: cfg.FREELANCER_ADDRESS },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
    { name: 'amount', value: String(amount) },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
