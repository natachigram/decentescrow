import { createDataItemSigner, message, dryrun } from '@permaweb/aoconnect';

// Utility: simple logger
const logEl = document.getElementById('log');
const log = (...a) => {
  const s = a
    .map((x) => (typeof x === 'string' ? x : JSON.stringify(x, null, 2)))
    .join(' ');
  logEl.textContent += s + '\n';
  logEl.scrollTop = logEl.scrollHeight;
  console.log(...a);
};

// Grab inputs
const $ = (id) => document.getElementById(id);
const addrEl = $('addr');
const statusEl = $('walletStatus');

const escrowPidEl = $('escrowPid');
const tokenPidEl = $('tokenPid');
const jobIdEl = $('jobId');
const amountEl = $('amount');
const metaEl = $('meta');
const jobId2El = $('jobId2');
const jobId3El = $('jobId3');
const freelancerAddrEl = $('freelancerAddr');
const claimTokenEl = $('claimToken');
const claimAmountEl = $('claimAmount');
const vJobIdEl = $('vJobId');
const vAddrEl = $('vAddr');
const vTokenEl = $('vToken');

let walletApi = null; // window.arweaveWallet
let currentAddress = null;

// Wallet connect/disconnect
async function connectWallet() {
  detectWallet();
  if (!walletApi) {
    log('No wallet found. Install Wander or ArConnect.');
    return;
  }
  const appInfo = { name: 'DecentEscrow Sample' };
  const candidates = [
    // Wander commonly uses SIGNATURE; ArConnect supports this too
    { type: 'array', perms: ['ACCESS_ADDRESS', 'SIGNATURE'] },
    // Wallet Standard object shape
    { type: 'object', perms: ['ACCESS_ADDRESS', 'SIGNATURE'] },
    // Some wallets support SIGN_DATA_ITEM explicitly
    { type: 'array', perms: ['ACCESS_ADDRESS', 'SIGN_DATA_ITEM'] },
    { type: 'object', perms: ['ACCESS_ADDRESS', 'SIGN_DATA_ITEM'] },
    // Some wallets require SIGN_TRANSACTION for data-item signing
    { type: 'array', perms: ['ACCESS_ADDRESS', 'SIGN_TRANSACTION'] },
    { type: 'object', perms: ['ACCESS_ADDRESS', 'SIGN_TRANSACTION'] },
    // Some wallets only recognize ACCESS_PUBLIC_KEY
    { type: 'array', perms: ['ACCESS_ADDRESS', 'ACCESS_PUBLIC_KEY'] },
    { type: 'object', perms: ['ACCESS_ADDRESS', 'ACCESS_PUBLIC_KEY'] },
    // Minimal connect then request signing on first use
    { type: 'array', perms: ['ACCESS_ADDRESS'] },
    { type: 'object', perms: ['ACCESS_ADDRESS'] },
  ];

  let connected = false;
  let lastErr = null;
  for (const c of candidates) {
    try {
      if (c.type === 'array') {
        await walletApi.connect(c.perms, appInfo);
      } else {
        await walletApi.connect({ permissions: c.perms, appInfo });
      }
      connected = true;
      log('Connected with permissions:', c.perms.join(', '));
      break;
    } catch (e) {
      lastErr = e;
      // Keep trying next variant
    }
  }
  if (!connected) {
    // Ultimate fallback: try connect() with no args (some wallets support this)
    try {
      await walletApi.connect();
      connected = true;
      log('Connected with no-args connect()');
    } catch (e) {
      lastErr = e;
    }
  }
  if (!connected) {
    log('Connect error:', lastErr?.message || lastErr);
    statusEl.textContent = 'connect failed';
    return;
  }

  try {
    const addr = await (walletApi.getActiveAddress
      ? walletApi.getActiveAddress()
      : walletApi.getActivePublicKey?.());
    currentAddress = addr || null;
    addrEl.textContent = currentAddress || '-';
    statusEl.textContent = currentAddress
      ? 'connected'
      : 'connected (no address)';
    log('Connected address:', currentAddress);
  } catch (e) {
    statusEl.textContent = 'connected (addr error)';
    log('Post-connect error:', e?.message || e);
  }
}

async function disconnectWallet() {
  if (!walletApi) return;
  try {
    await walletApi.disconnect();
  } catch {}
  currentAddress = null;
  addrEl.textContent = '-';
  statusEl.textContent = 'disconnected';
  log('Disconnected');
}

// Create signer that delegates signing to the wallet provider
function walletSigner() {
  if (!walletApi) throw new Error('Connect wallet first');
  return createDataItemSigner(walletApi);
}

async function send(processId, tags, data) {
  const signer = walletSigner();
  try {
    const res = await withTimeout(
      () => message({ process: processId, signer, tags, data }),
      20000
    );
    log('Sent message id:', res);
    return res;
  } catch (e) {
    const msg = e?.message || String(e);
    // Detect missing permission errors and try to request them, then retry once
    const needed = [];
    if (msg.includes('SIGN_TRANSACTION')) needed.push('SIGN_TRANSACTION');
    if (msg.includes('SIGN_DATA_ITEM')) needed.push('SIGN_DATA_ITEM');
    if (msg.includes('SIGNATURE')) needed.push('SIGNATURE');
    if (needed.length) {
      log('Requesting additional wallet permission(s):', needed.join(', '));
      const ok = await requestMorePermissions(needed).catch(() => false);
      if (ok) {
        const res2 = await withTimeout(
          () =>
            message({ process: processId, signer: walletSigner(), tags, data }),
          20000
        );
        log('Sent message id (after perms):', res2);
        return res2;
      }
    }
    // Some browser extensions throw: "A listener indicated an asynchronous response...".
    // Retry once after brief delay.
    if (/asynchronous response/i.test(msg)) {
      await sleep(500);
      const res3 = await withTimeout(
        () =>
          message({ process: processId, signer: walletSigner(), tags, data }),
        20000
      );
      log('Sent message id (after retry):', res3);
      return res3;
    }
    throw e;
  }
}

async function requestMorePermissions(perms) {
  if (!walletApi) return false;
  const appInfo = { name: 'DecentEscrow Sample' };
  // Try requestPermissions if available
  try {
    if (typeof walletApi.requestPermissions === 'function') {
      try {
        await walletApi.requestPermissions(perms);
        return true;
      } catch {}
      try {
        await walletApi.requestPermissions({ permissions: perms, appInfo });
        return true;
      } catch {}
    }
  } catch {}
  // Fallback to connect with augmented perms
  try {
    await walletApi.connect(perms, appInfo);
    return true;
  } catch {}
  try {
    await walletApi.connect({ permissions: perms, appInfo });
    return true;
  } catch {}
  return false;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function withTimeout(fn, ms) {
  let timer;
  try {
    return await Promise.race([
      fn(),
      new Promise((_, rej) => {
        timer = setTimeout(
          () => rej(new Error('Wallet request timed out')),
          ms
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

// Manual permission buttons
$('btn-perm-dataitem')?.addEventListener('click', async () => {
  const ok = await requestMorePermissions(['SIGN_DATA_ITEM']);
  log('SIGN_DATA_ITEM requested:', ok);
});
$('btn-perm-tx')?.addEventListener('click', async () => {
  const ok = await requestMorePermissions(['SIGN_TRANSACTION']);
  log('SIGN_TRANSACTION requested:', ok);
});
$('btn-perm-list')?.addEventListener('click', async () => {
  try {
    const granted = await (walletApi?.getPermissions?.() ||
      walletApi?.permissions?.());
    document.getElementById('perm-list').textContent =
      'Granted: ' + JSON.stringify(granted || null);
    log('Granted permissions:', granted);
  } catch (e) {
    log('Could not fetch permissions:', e?.message || e);
  }
});

// Actions
async function approve() {
  const token = tokenPidEl.value.trim();
  const escrow = escrowPidEl.value.trim();
  const amount = amountEl.value.trim();
  if (!token || !escrow)
    throw new Error('Token and Escrow process IDs required');
  if (!amount || amount === '0') throw new Error('Amount must be > 0');
  await send(token, [
    { name: 'Action', value: 'Approve' },
    { name: 'Spender', value: escrow },
    { name: 'Quantity', value: String(amount) },
  ]);
}

async function deposit() {
  const escrow = escrowPidEl.value.trim();
  const token = tokenPidEl.value.trim();
  const jobId = jobIdEl.value.trim();
  const amount = amountEl.value.trim();
  const metaVal = metaEl.value.trim();
  if (!escrow || !token)
    throw new Error('Escrow and Token process IDs required');
  if (!currentAddress) throw new Error('Connect wallet');
  if (!jobId) throw new Error('Job ID required');
  if (!amount || amount === '0') throw new Error('Amount must be > 0');

  const tags = [
    { name: 'Action', value: 'Deposit' },
    { name: 'jobId', value: jobId },
    { name: 'client', value: currentAddress },
    { name: 'token', value: token },
    { name: 'amount', value: String(amount) },
  ];
  // Meta is optional; pass as tag to fit current script shape
  if (metaVal) tags.push({ name: 'meta', value: metaVal });

  await send(escrow, tags);
}

async function release() {
  const escrow = escrowPidEl.value.trim();
  const jobId = jobId2El.value.trim();
  if (!escrow) throw new Error('Escrow process ID required');
  if (!jobId) throw new Error('Job ID required');
  await send(escrow, [
    { name: 'Action', value: 'Release' },
    { name: 'jobId', value: jobId },
  ]);
}

async function refund() {
  const escrow = escrowPidEl.value.trim();
  const jobId = jobId2El.value.trim();
  if (!escrow) throw new Error('Escrow process ID required');
  if (!jobId) throw new Error('Job ID required');
  await send(escrow, [
    { name: 'Action', value: 'Refund' },
    { name: 'jobId', value: jobId },
  ]);
}

async function claim() {
  const token = claimTokenEl.value.trim();
  const amount = claimAmountEl.value.trim();
  const escrow = escrowPidEl.value.trim();
  if (!escrow) throw new Error('Escrow process ID required');
  const tags = [{ name: 'Action', value: 'Claim' }];
  if (token) tags.push({ name: 'token', value: token });
  if (amount) tags.push({ name: 'amount', value: String(amount) });
  await send(escrow, tags);
}

async function assign() {
  const escrow = escrowPidEl.value.trim();
  const jobId = jobId3El.value.trim();
  const freelancer = freelancerAddrEl.value.trim();
  if (!escrow) throw new Error('Escrow process ID required');
  if (!jobId) throw new Error('Job ID required');
  if (!freelancer) throw new Error('Freelancer address required');
  await send(escrow, [
    { name: 'Action', value: 'AssignFreelancer' },
    { name: 'jobId', value: jobId },
    { name: 'freelancer', value: freelancer },
  ]);
}

// Wire UI
$('btn-connect').addEventListener('click', () =>
  connectWallet().catch((e) => log(e?.message || e))
);
$('btn-disconnect').addEventListener('click', () => disconnectWallet());
$('btn-approve').addEventListener('click', () =>
  approve().catch((e) => log('Approve error:', e?.message || e))
);
$('btn-deposit').addEventListener('click', () =>
  deposit().catch((e) => log('Deposit error:', e?.message || e))
);
$('btn-release').addEventListener('click', () =>
  release().catch((e) => log('Release error:', e?.message || e))
);
$('btn-refund').addEventListener('click', () =>
  refund().catch((e) => log('Refund error:', e?.message || e))
);
$('btn-claim').addEventListener('click', () =>
  claim().catch((e) => log('Claim error:', e?.message || e))
);
$('btn-assign').addEventListener('click', () =>
  assign().catch((e) => log('Assign error:', e?.message || e))
);

log('Ready. Enter process IDs, connect wallet, then Approve → Deposit.');

function detectWallet() {
  walletApi = window.arweaveWallet || null;
  statusEl.textContent = walletApi ? 'detected' : 'not detected';
}

// Detect on load
detectWallet();
window.addEventListener('arweaveWalletLoaded', detectWallet);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) detectWallet();
});

// Read-only helpers using dryrun
async function getJob() {
  const escrow = escrowPidEl.value.trim();
  const jobId = vJobIdEl.value.trim();
  if (!escrow || !jobId) throw new Error('Provide escrow and jobId');
  const res = await dryrun({
    process: escrow,
    tags: [
      { name: 'Action', value: 'GetJob' },
      { name: 'jobId', value: jobId },
    ],
  });
  const msg = res.Messages?.find((m) =>
    m.Tags?.some((t) => t.name === 'Action' && t.value === 'GetJobResult')
  );
  const data = msg?.Data || '{}';
  log('GetJob:', { jobId, job: safeParse(data) });
}

async function getPending() {
  const escrow = escrowPidEl.value.trim();
  if (!escrow) throw new Error('Provide escrow');
  const tags = [{ name: 'Action', value: 'GetPending' }];
  const addr = vAddrEl.value.trim();
  const token = vTokenEl.value.trim();
  if (addr) tags.push({ name: 'addr', value: addr });
  if (token) tags.push({ name: 'token', value: token });
  const res = await dryrun({ process: escrow, tags });
  const msg = res.Messages?.find((m) =>
    m.Tags?.some((t) => t.name === 'Action' && t.value === 'GetPendingResult')
  );
  const data = msg?.Data || '[]';
  log('GetPending:', { address: addr || '(caller)', tokens: safeParse(data) });
}

function safeParse(s) {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

// Wire verify buttons
$('btn-get-job').addEventListener('click', () =>
  getJob().catch((e) => log('GetJob error:', e?.message || e))
);
$('btn-get-pending').addEventListener('click', () =>
  getPending().catch((e) => log('GetPending error:', e?.message || e))
);
