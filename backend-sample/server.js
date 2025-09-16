import express from 'express';
import morgan from 'morgan';
import cors from 'cors';
import { dryrun } from '@permaweb/aoconnect';

const app = express();
app.use(cors());
app.use(morgan('dev'));
app.use(express.json());

// Env: ESCROW_PROCESS_ID or pass via query
const DEFAULT_ESCROW = process.env.ESCROW_PROCESS_ID || '';

// Health
app.get('/health', (_req, res) => res.json({ ok: true }));

// GET /job/:id?escrow=...
app.get('/job/:id', async (req, res) => {
  const escrow = (req.query.escrow || DEFAULT_ESCROW).toString();
  const jobId = req.params.id;
  if (!escrow)
    return res.status(400).json({ error: 'Missing escrow process id' });
  try {
    const result = await dryrun({
      process: escrow,
      tags: [
        { name: 'Action', value: 'GetJob' },
        { name: 'jobId', value: jobId },
      ],
    });
    // Find reply action with GetJobResult
    const reply = result.Messages?.find((m) =>
      m.Tags?.some((t) => t.name === 'Action' && t.value === 'GetJobResult')
    );
    const data = reply?.Data || '{}';
    return res.json({ id: jobId, data: parseJsonSafe(data) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

// GET /pending/:addr?escrow=...&token=...
app.get('/pending/:addr', async (req, res) => {
  const escrow = (req.query.escrow || DEFAULT_ESCROW).toString();
  const addr = req.params.addr;
  if (!escrow)
    return res.status(400).json({ error: 'Missing escrow process id' });
  try {
    const result = await dryrun({
      process: escrow,
      tags: [
        { name: 'Action', value: 'GetPending' },
        { name: 'addr', value: addr },
      ],
    });
    const reply = result.Messages?.find((m) =>
      m.Tags?.some((t) => t.name === 'Action' && t.value === 'GetPendingResult')
    );
    const data = reply?.Data || '[]';
    return res.json({ address: addr, tokens: parseJsonSafe(data) });
  } catch (e) {
    return res.status(500).json({ error: e?.message || String(e) });
  }
});

function parseJsonSafe(s) {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
}

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`Backend sample running on :${PORT}`));
