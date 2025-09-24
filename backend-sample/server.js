import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { createDataItemSigner, message } from '@permaweb/aoconnect';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const app = express();
app.use(express.json());

// Simple CORS for local testing from any origin (file:// or other ports)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');
  if (req.method === 'OPTIONS') return res.status(204).end();
  next();
});

function requiredEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

function getSigner() {
  const jwkPath = requiredEnv('WALLET_PATH');
  const jwk = JSON.parse(
    require('fs').readFileSync(path.resolve(jwkPath), 'utf-8')
  );
  return createDataItemSigner(jwk);
}

const ESCROW = process.env.ESCROW_PROCESS_ID || '';
const TOKEN = process.env.TOKEN_PROCESS_ID || 'AR';

async function send(tags, data) {
  const signer = getSigner();
  return await message({ process: ESCROW, signer, tags, data });
}

app.post('/deposit', async (req, res) => {
  try {
    const { jobId, amount, meta } = req.body;
    if (!jobId || !amount)
      return res.status(400).json({ error: 'jobId and amount required' });
    const id = await send([
      { name: 'Action', value: 'Deposit' },
      { name: 'jobId', value: String(jobId) },
      { name: 'amount', value: String(amount) },
      { name: 'token', value: TOKEN },
      ...(meta
        ? [
            {
              name: 'meta',
              value: typeof meta === 'string' ? meta : JSON.stringify(meta),
            },
          ]
        : []),
    ]);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/assign', async (req, res) => {
  try {
    const { jobId, freelancer } = req.body;
    if (!jobId || !freelancer)
      return res.status(400).json({ error: 'jobId and freelancer required' });
    const id = await send([
      { name: 'Action', value: 'AssignFreelancer' },
      { name: 'jobId', value: String(jobId) },
      { name: 'freelancer', value: String(freelancer) },
    ]);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/release', async (req, res) => {
  try {
    const { jobId } = req.body;
    if (!jobId) return res.status(400).json({ error: 'jobId required' });
    const id = await send([
      { name: 'Action', value: 'Release' },
      { name: 'jobId', value: String(jobId) },
    ]);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

app.post('/claim', async (req, res) => {
  try {
    const { token, amount } = req.body;
    const id = await send([
      { name: 'Action', value: 'Claim' },
      ...(token ? [{ name: 'token', value: String(token) }] : []),
      ...(amount ? [{ name: 'amount', value: String(amount) }] : []),
    ]);
    res.json({ ok: true, id });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e) });
  }
});

const port = Number(process.env.PORT || 8787);
app.listen(port, () => console.log(`Backend running on :${port}`));
