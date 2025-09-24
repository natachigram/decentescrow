import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  if (!cfg.ESCROW_PROCESS_ID) throw new Error('Missing ESCROW_PROCESS_ID');

  // 1) InitOwner
  console.log('Sending InitOwner...');
  await send(cfg.ESCROW_PROCESS_ID, [{ name: 'Action', value: 'InitOwner' }]);

  // 2) SetConfig with 5% fee and addresses
  console.log('Sending SetConfig...');
  const tags = [
    { name: 'Action', value: 'SetConfig' },
    { name: 'platformFeeBps', value: String(cfg.PLATFORM_FEE_BPS ?? 500) },
  ];
  if (cfg.PLATFORM_TREASURY)
    tags.push({ name: 'platformTreasury', value: cfg.PLATFORM_TREASURY });
  if (cfg.ARBITER) tags.push({ name: 'arbiter', value: cfg.ARBITER });

  await send(cfg.ESCROW_PROCESS_ID, tags);

  console.log('Init complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
