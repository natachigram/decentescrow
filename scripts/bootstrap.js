import { loadConfig, send } from './utils.js';

async function main() {
  const cfg = loadConfig();
  if (!cfg.TOKEN_PROCESS_ID) throw new Error('Missing TOKEN_PROCESS_ID');
  if (!cfg.ESCROW_PROCESS_ID)
    throw new Error(
      'Set ESCROW_PROCESS_ID in config/config.json after deploying the process via aos'
    );

  // 1) Init owner (run once, safe to retry if not set)
  await send(cfg.ESCROW_PROCESS_ID, [{ name: 'Action', value: 'InitOwner' }]);

  // 2) Set default token (also auto-allow)
  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'SetDefaultToken' },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
  ]);

  // 3) Explicit allow (harmless if already allowed)
  await send(cfg.ESCROW_PROCESS_ID, [
    { name: 'Action', value: 'AllowToken' },
    { name: 'token', value: cfg.TOKEN_PROCESS_ID },
  ]);

  // 4) Optional: Set platform config if provided
  const tags = [{ name: 'Action', value: 'SetConfig' }];
  if (typeof cfg.PLATFORM_FEE_BPS === 'number')
    tags.push({ name: 'platformFeeBps', value: String(cfg.PLATFORM_FEE_BPS) });
  if (cfg.PLATFORM_TREASURY)
    tags.push({ name: 'platformTreasury', value: cfg.PLATFORM_TREASURY });
  if (cfg.ARBITER) tags.push({ name: 'arbiter', value: cfg.ARBITER });
  if (typeof cfg.TIMEOUT_SECS === 'number')
    tags.push({ name: 'timeoutSecs', value: String(cfg.TIMEOUT_SECS) });
  if (tags.length > 1) await send(cfg.ESCROW_PROCESS_ID, tags);

  console.log('Bootstrap complete');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
