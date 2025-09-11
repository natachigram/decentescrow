import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  if (!cfg.ESCROW_PROCESS_ID) throw new Error('Missing ESCROW_PROCESS_ID');
  const token = process.env.TOKEN || cfg.TOKEN_PROCESS_ID;
  const amount = process.env.AMOUNT; // optional
  const tags = [
    { name: 'Action', value: 'Claim' },
    ...(token ? [{ name: 'token', value: token }] : []),
    ...(amount ? [{ name: 'amount', value: String(amount) }] : []),
  ];
  await send(cfg.ESCROW_PROCESS_ID, tags);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
