import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  const jobId = 'simple-test-' + Date.now();
  const amount = '1';

  console.log('Sending ONLY as tags (no JSON data):');
  console.log('Tags to be sent:');
  const tags = [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
    { name: 'amount', value: amount },
  ];

  tags.forEach((tag) => {
    console.log(`  ${tag.name}: "${tag.value}" (type: ${typeof tag.value})`);
  });

  // Send with NO JSON data, only tags
  await send(cfg.ESCROW_PROCESS_ID, tags);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
