# AO Escrow for Freelance Jobs

This repo contains an Arweave AO process implementing a decentralized escrow for a freelance marketplace, plus Node scripts for interaction. No frontend is included in this repo.

Important: The escrow requires an AO token process to exist. If your platform doesn't have a token yet, create one via coin.ar.io or a Warp token template first, then use its Process ID.

## Contents
- `ao/escrow.lua` — AO process managing deposit/release/refund and optional fee/arbiter/timeout.
- `scripts/` — Node scripts using `@permaweb/aoconnect` to interact.
- `config/config.example.json` — Example configuration for process IDs and addresses.
- `tests/` — Lightweight unit tests with a mocked AO runtime.

## Quick Start

1) Create or choose AO Token
- If you already have a token process, note its Process ID (e.g., `TOKEN_PROCESS_ID`).
- If not, create a token via https://coin.ar.io/ or deploy a Warp AO token template. Save the token Process ID.

2) Deploy Escrow Process
- Install `aos` CLI if not installed: see https://github.com/permaweb/aos
- Start the REPL and load the process:
	- Open a terminal in the repo root.
	- Start `aos`.
	- Deploy from file in the REPL: `Deploy from file ao/escrow.lua`
	- Note the new Process ID (this is your `ESCROW_PROCESS_ID`).

3) Configure scripts
- Copy `config/config.example.json` to `config/config.json` and fill values (set your `ESCROW_PROCESS_ID`, token, addresses, fee/timeout).
- Create a `.env` at the repo root with `WALLET_PATH=/absolute/path/to/wallet.json`.
- From `scripts/`, run `npm install`.

4) Bootstrap (owner + token + config)
- From `scripts/`, run: `npm run bootstrap` (after setting `ESCROW_PROCESS_ID`).
- This will run InitOwner, SetDefaultToken, AllowToken and optionally SetConfig.

5) Approvals
- Ensure the token process supports approvals or process-call transfers to allow the escrow to pull funds from the client on deposit.
- The client must approve the escrow process to spend at least `amount` of tokens, if the token uses approval mechanics.
- If the token doesn't support approvals, pre-transfer the funds to the escrow process address and then call `Deposit` (the contract will record state; ensure funds are present).

6) Use Scripts
- Approve: from `scripts/` run `QTY=1000000 npm run approve`
- Deposit: `AMOUNT=1000000 JOB_ID=job-1 npm run deposit`
- Release: `JOB_ID=job-1 npm run release`
- Refund: `JOB_ID=job-1 npm run refund`

Tips:
- Use Wander testnet if preferred; ensure both token and escrow are deployed to the same environment.

## Security Notes
- The lifecycle is `locked -> released | refunded`. No double spending.
- Only the job's client can `release` or `refund` (unless arbiter in dispute mode).
- Optional: timeouts allow freelancer to claim after inactivity.

## Backend Integration

This section explains how your backend can index escrow events and, where appropriate, send messages to the escrow process.

### Contract interface

- Actions (write):
	- Deposit: { Action='Deposit', jobId, client, freelancer, amount[, token][, meta] }
	- Release: { Action='Release', jobId } (must be sent From the client)
	- Refund: { Action='Refund', jobId } (must be sent From the client)
	- OpenDispute: { Action='OpenDispute', jobId, reason }
	- DecideDispute: { Action='DecideDispute', jobId, outcome='release'|'refund' } (arbiter only)
	- ClaimTimeout: { Action='ClaimTimeout', jobId }
	- Admin: InitOwner, SetConfig, AllowToken, DisallowToken, SetDefaultToken, Pause, Unpause, TransferOwnership, AdminResetJob

- Views (read):
	- GetJob: { Action='GetJob', jobId }
	- ListJobs: { Action='ListJobs', limit }
	- GetConfig: { Action='GetConfig' }
	- ListAllowedTokens: { Action='ListAllowedTokens' }

### Emitted events

- Deposited { jobId, client, freelancer, token, amount, _v }
- Released { jobId, amount, fee, payout, [by], _v }
- Refunded { jobId, amount, [by], _v }
- DisputeOpened { jobId, by, reason, _v }
- ConfigUpdated {..., _v }, OwnerSet { owner, _v }
- Paused/Unpaused { by, _v }
- TokenAllowed/TokenDisallowed { token, _v }, DefaultTokenSet { token, _v }
- JobReset { jobId, _v }

All events include `_v` (schema version) to aid migration.

### Indexing with Node (polling example)

You can poll process results and parse emitted payloads. Here’s a minimal approach using `@permaweb/aoconnect`:

1) Add a script (we include `scripts/indexer.js`) and set `ESCROW_PROCESS_ID` in `config/config.json`.
2) Run it with `node scripts/indexer.js`.

Indexing strategy tips:
- Maintain a persistent cursor (last seen message/result id) in your DB.
- Parse only known events; store jobId, amount, fee/payout, token, parties, timestamps.
- Ensure idempotency when persisting (unique on result id or jobId+event type).
- Backoff/retry on network issues.

### Server-side sending (when appropriate)

- The backend should not impersonate users. Client actions (Deposit/Release/Refund) should be signed by the user’s wallet.
- The backend can manage admin ops (Pause, SetConfig, AllowToken) with an admin wallet, and can facilitate UX by:
	- Returning prepared tags for the client to sign and send.
	- Verifying preconditions (approval amounts, balances) off-chain.

### Token approvals

- If the token supports `Approve`/`TransferFrom`, the client must approve the escrow to pull `amount`.
- If a token doesn’t support approvals, require a pre-transfer and then call `Deposit` to record the job.


## Example Message Shapes (aos)

- Deposit
	- With default token set:
		- `Send({ Target = ESCROW_PROCESS_ID, Action = 'Deposit', jobId = 'job-123', client = CLIENT_ADDR, freelancer = FREELANCER_ADDR, amount = '1000000', meta = { title = 'Logo Design', deadline = '2025-09-30' } })`
	- Or specifying token explicitly:
		- `Send({ Target = ESCROW_PROCESS_ID, Action = 'Deposit', jobId = 'job-123', client = CLIENT_ADDR, freelancer = FREELANCER_ADDR, token = TOKEN_PROCESS_ID, amount = '1000000' })`
	- Ensure the client has approved the escrow to spend `amount` tokens: `Send({ Target = TOKEN_PROCESS_ID, Action = 'Approve', Spender = ESCROW_PROCESS_ID, Quantity = '1000000' })`

- Release
	- `Send({ Target = ESCROW_PROCESS_ID, Action = 'Release', jobId = 'job-123' })` (must be sent From the client)

- Refund
	- `Send({ Target = ESCROW_PROCESS_ID, Action = 'Refund', jobId = 'job-123' })` (must be sent From the client)

- Dispute (optional)
	- `Send({ Target = ESCROW_PROCESS_ID, Action = 'OpenDispute', jobId = 'job-123', reason = 'Work not as agreed' })`
	- `Send({ Target = ESCROW_PROCESS_ID, Action = 'DecideDispute', jobId = 'job-123', outcome = 'refund' })` (from `arbiter`)

- Timeout claim (optional)
	- `Send({ Target = ESCROW_PROCESS_ID, Action = 'ClaimTimeout', jobId = 'job-123' })`

## License
MIT
