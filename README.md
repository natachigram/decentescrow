# AO Escrow for Freelance Jobs

**🎯 Deployed & Live**: Process ID `PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4`  
**🪙 Token**: `Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I`

## Contents
- `ao/escrow.lua` — AO process managing deposit/release/refund and optional fee/arbiter/timeout.
- `scripts/` — Node scripts using `@permaweb/aoconnect` to interact.
- `config/config.example.json` — Example configuration for process IDs and addresses.
- `tests/` — Lightweight unit tests with a mocked AO runtime.


## Backend Integration

### 🔧 Live Deployment Details
- **Escrow Process**: `PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4`
- **Token Process**: `Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I`
- **Network**: AO Testnet (production-ready)
- **Platform Fee**: 1% (100 basis points)
- **Treasury**: `PbznRpqpBT9bEoGwJpfGlktNjUYL8rrC4nxYC0rNDt8`

### 📝 Contract Interface

**Write Actions (require user wallet signature):**
```javascript
// Create escrow deposit (requires prior token approval)
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action: "Deposit",
  jobId: "unique-job-id",
  client: "client-wallet-address",
  freelancer: "freelancer-wallet-address", 
  amount: "1000000", // in smallest token units
  meta: { title: "Logo Design", deadline: "2025-12-31" } // optional metadata
}

// Release funds to freelancer (client signature required)
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action: "Release",
  jobId: "unique-job-id"
}

// Refund to client (client signature required)
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4", 
  Action: "Refund",
  jobId: "unique-job-id"
}
```

**Read Actions (no signature required):**
```javascript
// Get specific job details
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action: "GetJob", 
  jobId: "unique-job-id"
}

// List all escrow jobs
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action: "ListJobs",
  limit: 50 // optional pagination
}

// Get contract configuration
{
  Target: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action: "GetConfig"
}
```

### 📡 Event Monitoring

Monitor contract events for real-time job state updates:

```javascript
// Job deposit created
{
  _v: "1.0",
  event: "Deposited", 
  jobId: "job-123",
  client: "client-address",
  freelancer: "freelancer-address", 
  token: "Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I",
  amount: "1000000"
}

// Funds released to freelancer  
{
  _v: "1.0",
  event: "Released",
  jobId: "job-123", 
  amount: "990000", // after 1% platform fee deduction
  fee: "10000",     // platform fee collected
  payout: "990000"  // actual freelancer payout
}

// Funds refunded to client
{
  _v: "1.0", 
  event: "Refunded",
  jobId: "job-123",
  amount: "1000000" // full refund, no fee on refunds
}

// Configuration changes (admin only)
{
  _v: "1.0",
  event: "ConfigUpdated",
  treasury: "new-treasury-address",
  fee: 150 // new fee in basis points
}
```

### 🛠 Node.js Integration

Use `@permaweb/aoconnect` for production backends:

```javascript
import { createDataItemSigner, message, result } from '@permaweb/aoconnect'
import fs from 'fs'

// Load wallet from AOS config or your secure storage
const wallet = JSON.parse(fs.readFileSync('~/.aos.json'))
const signer = createDataItemSigner(wallet)

// Example: Create escrow deposit
async function createDeposit(jobId, clientAddr, freelancerAddr, amount) {
  const messageId = await message({
    process: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
    signer,
    tags: [
      { name: "Action", value: "Deposit" },
      { name: "jobId", value: jobId },
      { name: "client", value: clientAddr },
      { name: "freelancer", value: freelancerAddr },
      { name: "amount", value: amount.toString() }
    ]
  })
  
  // Wait for result and check for errors
  const messageResult = await result({
    message: messageId,
    process: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4"
  })
  
  return { messageId, result: messageResult }
}

// Example: Release funds (client only)
async function releaseFunds(jobId) {
  const messageId = await message({
    process: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
    signer,
    tags: [
      { name: "Action", value: "Release" },
      { name: "jobId", value: jobId }
    ]
  })
  
  return messageId
}
```

### 💳 Token Approval Workflow

**Critical**: Always approve tokens before creating deposits:

```javascript
// Step 1: Approve escrow to spend client's tokens
async function approveTokens(amount) {
  const approveId = await message({
    process: "Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I", // token contract
    signer,
    tags: [
      { name: "Action", value: "Approve" },
      { name: "Spender", value: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4" }, // escrow
      { name: "Quantity", value: amount.toString() }
    ]
  })
  
  // Wait for approval confirmation
  const approveResult = await result({
    message: approveId,
    process: "Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I"
  })
  
  return approveId
}

// Step 2: Create deposit (escrow will pull approved tokens)
// Use createDeposit() function above
```


### 📊 Indexer Implementation

Basic event indexer using the provided `scripts/indexer.js`:

```javascript
// Poll contract results and index events
import { results } from '@permaweb/aoconnect'

async function indexEvents(cursor = null) {
  const { edges, pageInfo } = await results({
    process: "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
    after: cursor,
    limit: 50
  })
  
  for (const edge of edges) {
    const result = edge.node
    if (result.Output?.data) {
      try {
        const event = JSON.parse(result.Output.data)
        if (event._v && event.event) {
          await storeEvent(event, result.id)
        }
      } catch (e) {
        // Skip non-JSON outputs
      }
    }
  }
  
  return pageInfo.endCursor
}

// Store event with idempotency
async function storeEvent(event, resultId) {
  // Check if already processed
  const existing = await db.events.findOne({ resultId })
  if (existing) return
  
  // Store event based on type
  switch (event.event) {
    case 'Deposited':
      await db.jobs.create({
        id: event.jobId,
        client: event.client,
        freelancer: event.freelancer,
        amount: event.amount,
        status: 'locked',
        created: new Date()
      })
      break
      
    case 'Released':
      await db.jobs.updateOne(
        { id: event.jobId },
        { status: 'released', payout: event.payout, fee: event.fee }
      )
      break
      
    case 'Refunded':
      await db.jobs.updateOne(
        { id: event.jobId },
        { status: 'refunded' }
      )
      break
  }
  
  // Store raw event
  await db.events.create({ resultId, event, processed: new Date() })
}
```

## Example Message Shapes (aos CLI)

For testing with the AOS CLI:

```lua
-- Deposit with default token
Send({
  Target = "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action = "Deposit",
  jobId = "job-123",
  client = "CLIENT_WALLET_ADDRESS",
  freelancer = "FREELANCER_WALLET_ADDRESS",
  amount = "1000000",
  meta = { title = "Logo Design", deadline = "2025-09-30" }
})

-- Release funds (from client wallet)
Send({
  Target = "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Action = "Release",
  jobId = "job-123"
})

-- Token approval (required before deposit)
Send({
  Target = "Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I",
  Action = "Approve",
  Spender = "PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4",
  Quantity = "1000000"
})
```

