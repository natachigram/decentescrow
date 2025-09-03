# Scripts

Minimal Node scripts for interacting with the escrow via `@permaweb/aoconnect`.

## Setup

- Copy `config/config.example.json` to `config/config.json`, fill IDs and addresses.
- Create `.env` at repo root with:
  - `WALLET_PATH=/absolute/path/to/wallet.json`
- Install deps:
  - From `scripts/`, run `npm install`

## Usage

- Approve (optional, if token requires):
  - `QTY=1000000 npm run approve`
- Deposit:
  - `AMOUNT=1000000 JOB_ID=job-1 npm run deposit`
- Release:
  - `JOB_ID=job-1 npm run release`
- Refund:
  - `JOB_ID=job-1 npm run refund`

### Admin

- Init owner:
  - `npm run admin -- init-owner`
- Pause / Unpause:
  - `npm run admin -- pause`
  - `npm run admin -- unpause`
- Allow / Disallow token:
  - `TOKEN=YOUR_TOKEN_PROCESS_ID npm run admin -- allow-token`
  - `TOKEN=YOUR_TOKEN_PROCESS_ID npm run admin -- disallow-token`
- Set default token:
  - `TOKEN=YOUR_TOKEN_PROCESS_ID npm run admin -- set-default-token`
- Transfer ownership:
  - `NEW_OWNER=ARWEAVE_ADDRESS npm run admin -- transfer-owner`
- Reset stuck job (rare ops):
  - `JOB_ID=job-1 npm run admin -- reset-job`
