import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = process.env.JOB_ID || 'job-1';
  if (!cfg.ESCROW_PROCESS_ID)
    throw new Error('Missing ESCROW_PROCESS_ID in config');
  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'Release' },
    { name: 'jobId', value: jobId },
  ]);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
