# 🚀 AO Escrow Deployment Guide

## Prerequisites Complete ✅
- [x] Escrow contract (`ao/escrow.lua`) - Production ready with tests passing
- [x] Token configured: `Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I`
- [x] Node scripts ready with bootstrap automation
- [x] Configuration templates prepared
- [x] CI workflow added for automated testing

## Next Steps for Deployment

### 1. Deploy the Escrow Process
```bash
# Install aos CLI if not already installed
npm install -g https://get_ao.g8way.io

# Start aos REPL
aos

# In the aos REPL, deploy the escrow:
Deploy from file ao/escrow.lua

# Copy the returned Process ID - this is your ESCROW_PROCESS_ID
```

### 2. Update Configuration
```bash
# Copy the example config
cp config/config.example.json config/config.json

# Edit config/config.json and set:
# - ESCROW_PROCESS_ID: (the process ID from step 1)
# - Keep TOKEN_PROCESS_ID: Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I
# - Set FREELANCER_ADDRESS: (replace "SET_ME" with actual address)

# Create environment file for wallet
cp .env.example .env
# Edit .env and set WALLET_PATH=/path/to/your/wallet.json
```

### 3. Bootstrap the Contract
```bash
cd scripts/
npm run bootstrap
```

This will automatically:
- Initialize you as the owner
- Set the default token
- Allow the token in the allowlist
- Apply platform fee/treasury configuration

### 4. Test the Full Flow
```bash
# Approve tokens (if your token requires approval)
QTY=1000000 npm run approve

# Create a test escrow
AMOUNT=1000000 JOB_ID=test-job-1 npm run deposit

# Release funds to freelancer
JOB_ID=test-job-1 npm run release

# OR refund to client
JOB_ID=test-job-1 npm run refund
```

## Production Checklist
- [ ] Deploy escrow process via aos
- [ ] Update `ESCROW_PROCESS_ID` in config
- [ ] Set proper `FREELANCER_ADDRESS` 
- [ ] Run bootstrap script
- [ ] Test approve → deposit → release flow
- [ ] Verify events are being emitted correctly
- [ ] Set up backend indexing for events (use `scripts/indexer.js` as starting point)

## Admin Operations
```bash
# Pause contract (emergency)
npm run admin -- pause

# Unpause contract
npm run admin -- unpause

# Add new allowed token
TOKEN=NEW_TOKEN_PROCESS_ID npm run admin -- allow-token

# Transfer ownership
NEW_OWNER=NEW_WALLET_ADDRESS npm run admin -- transfer-owner
```

The escrow is now ready for production use! 🎉
