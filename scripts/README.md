# Scripts

Minimal Node scripts for interacting with the escrow via `@permaweb/aoconnect`.

## Setup

- Copy `config/config.example.json` to `config/config.json`, fill IDs and addresses.
- Create `.env` at repo root with:
  - `WALLET_PATH=/absolute/path/to/wallet.json`
- Install deps:
  - From `scripts/`, run `npm install`

## Usage

End-to-end (client → assign → settle):

- Approve (client grants escrow allowance; if token enforces approvals)
  - `QTY=1000000000000000000 npm run approve`
- Deposit (client funds job; no freelancer yet)
  - `AMOUNT=1000000000000000000 JOB_ID=job-1 npm run deposit`
- Assign freelancer (client locks job)
  - `FREELANCER=<address> JOB_ID=job-1 npm run assign`
- Release funds (client settles to freelancer; credits pending)
  - `JOB_ID=job-1 npm run release`
- Refund (client refunds self; credits pending)
  - `JOB_ID=job-1 npm run refund`
- Claim pending (recipient pulls funds; token defaults to configured)
  - `npm run claim`
  - or specify: `TOKEN=<processId> AMOUNT=... npm run claim`

### Bootstrap (owner + default token + config)

After deploying the process in aos, set `ESCROW_PROCESS_ID` in `config/config.json` and run:

```
npm run bootstrap
```

This will:
- Init owner
- Set default token (auto-allow)
- Explicitly allow token
- Apply platform fee/treasury/arbiter/timeout if present in config

Additional owner ops:
- Cancel unassigned job (client only): `JOB_ID=job-1 npm run cancel`

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
