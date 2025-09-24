import { loadConfig, getSigner } from './utils.js';
import { message, result } from '@permaweb/aoconnect';

async function main() {
  const cfg = loadConfig();
  const signer = getSigner();
  const msgId = await message({
    process: cfg.ESCROW_PROCESS_ID,
    signer,
    tags: [{ name: 'Action', value: 'GetConfig' }],
  });
  const res = await result({ process: cfg.ESCROW_PROCESS_ID, message: msgId });
  let data = {};
  try {
    const msg = (res?.Messages || []).find((m) =>
      (m?.Tags || []).some(
        (t) => t.name === 'Action' && t.value === 'GetConfigResult'
      )
    );
    if (msg && msg.Data) data = JSON.parse(msg.Data);
  } catch {}
  console.log('GetConfigResult:', data);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
