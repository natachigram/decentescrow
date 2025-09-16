# Wallet Frontend + Read-only Backend Samples

This folder contains minimal examples you can reference or copy into your main app to enable client-side signing (Wander/ArConnect) and a read-only backend.

## Frontend (`frontend-sample/`)

Stack: Vite + vanilla JS + `@permaweb/aoconnect`.

Features:
- Connect wallet (Arweave Wallet Standard: Wander/ArConnect)
- Approve token allowance to the escrow
- Deposit to create a funded job
- Assign freelancer, Release, Refund
- Claim pending balances

Run:

1. `cd frontend-sample`
2. `npm install`
3. `npm run dev`
4. Open the URL shown. Connect your wallet, paste `ESCROW_PROCESS_ID` and `TOKEN_PROCESS_ID`, then Approve → Deposit.

Notes:
- No private keys. Signing happens in the wallet.
- Amounts are in smallest units as strings.
- Ensure the token process supports `Approve` and `TransferFrom` for the escrow.

## Backend (`backend-sample/`)

Stack: Express + `@permaweb/aoconnect` dryrun.

Endpoints:
- `GET /job/:id?escrow=...` → returns job data via `GetJob`
- `GET /pending/:addr?escrow=...` → returns pending balances via `GetPending`

Run:

1. `cd backend-sample`
2. `npm install`
3. `ESCROW_PROCESS_ID=YOUR_ESCROW_PROCESS_ID PORT=4000 npm start`
4. Test with your browser or curl.

Notes:
- Read-only; no wallet required.
- You can add DB persistence and cursoring based on your needs.
