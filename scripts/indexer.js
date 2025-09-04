// Minimal polling indexer example (for guidance)
// Real deployments should store cursors and persist to a DB.
import { loadConfig } from './utils.js';

async function main() {
  const cfg = loadConfig();
  if (!cfg.ESCROW_PROCESS_ID) throw new Error('Missing ESCROW_PROCESS_ID');
  console.log(
    'Backend indexer guidance: implement AO result polling using aoconnect or your infra.'
  );
  console.log(
    'Tip: persist last seen result id; parse ao.emitted payloads (_v versioned).'
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
