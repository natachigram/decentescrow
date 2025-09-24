import { loadConfig } from './utils.js';
import { createDataItemSigner, message, result } from '@permaweb/aoconnect';
import fs from 'fs';
import path from 'path';

async function main() {
  const cfg = loadConfig();
  const jwk = JSON.parse(
    fs.readFileSync(
      path.resolve(process.cwd(), process.env.WALLET_PATH || './wallet.json'),
      'utf-8'
    )
  );
  const signer = createDataItemSigner(jwk);
  const tags = [
    { name: 'Action', value: 'SetConfig' },
    { name: 'platformFeeBps', value: String(cfg.PLATFORM_FEE_BPS ?? 500) },
    { name: 'platformTreasury', value: cfg.PLATFORM_TREASURY },
    { name: 'arbiter', value: cfg.ARBITER },
  ];
  console.log('Sending SetConfig with:', tags);
  const data = JSON.stringify({
    platformFeeBps: Number(cfg.PLATFORM_FEE_BPS ?? 500),
    platformTreasury: cfg.PLATFORM_TREASURY,
    arbiter: cfg.ARBITER,
  });
  const msgId = await message({
    process: cfg.ESCROW_PROCESS_ID,
    signer,
    tags,
    data,
  });
  console.log('Msg Id:', msgId);
  const res = await result({ process: cfg.ESCROW_PROCESS_ID, message: msgId });
  const out =
    typeof res.Output === 'string'
      ? res.Output
      : JSON.stringify(res.Output || '');
  console.log('Result Summary:', {
    Messages: res.Messages?.length || 0,
    Spawns: res.Spawns?.length || 0,
    Output: out.slice(0, 200),
  });
  if (res.Error) console.error('Process Error:', res.Error);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
