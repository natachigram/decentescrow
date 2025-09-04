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

## 🔄 Complete Backend Integration Flow

This section provides a step-by-step guide for backend developers to integrate with the escrow system.

### 📋 Prerequisites

Install required dependencies:
```bash
npm install @permaweb/aoconnect arweave
```

Environment setup:
```javascript
// .env file
ESCROW_PROCESS_ID=PjQ6GNfY0D908qXhq1LQivzKLr-BaWgg8a08c5u7wN4
TOKEN_PROCESS_ID=Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I
WALLET_PATH=/path/to/wallet.json
DATABASE_URL=your_database_connection_string
```

### 🎯 Complete Workflow Implementation

#### **Step 1: Initial Setup & Dependencies**

```javascript
// escrow-service.js
import { connect, createDataItemSigner } from '@permaweb/aoconnect'
import fs from 'fs'

class EscrowService {
  constructor() {
    this.ao = connect()
    this.escrowProcessId = process.env.ESCROW_PROCESS_ID
    this.tokenProcessId = process.env.TOKEN_PROCESS_ID
    
    // Load wallet for admin operations (if needed)
    this.adminWallet = JSON.parse(fs.readFileSync(process.env.WALLET_PATH))
    this.adminSigner = createDataItemSigner(this.adminWallet)
  }
}
```

#### **Step 2: Job Creation Flow**

```javascript
// API endpoint: POST /api/jobs
app.post('/api/jobs', async (req, res) => {
  try {
    const { title, description, budget, clientId, freelancerId } = req.body
    
    // 1. Generate unique job ID
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
    
    // 2. Store job in database
    const job = await db.jobs.create({
      id: jobId,
      title,
      description,
      budget: parseInt(budget), // Convert to token smallest units
      client_id: clientId,
      freelancer_id: freelancerId,
      status: 'pending', // pending -> escrowed -> completed/refunded
      created_at: new Date()
    })
    
    // 3. Get client and freelancer wallet addresses
    const client = await db.users.findById(clientId)
    const freelancer = await db.users.findById(freelancerId)
    
    res.json({
      jobId,
      status: 'pending',
      escrowData: {
        escrowProcess: process.env.ESCROW_PROCESS_ID,
        tokenProcess: process.env.TOKEN_PROCESS_ID,
        amount: budget.toString(),
        clientAddress: client.wallet_address,
        freelancerAddress: freelancer.wallet_address
      }
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

#### **Step 3: Token Approval Helper**

```javascript
// API endpoint: GET /api/jobs/:jobId/approval-params
app.get('/api/jobs/:jobId/approval-params', async (req, res) => {
  try {
    const { jobId } = req.params
    const job = await db.jobs.findById(jobId)
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    res.json({
      tokenProcess: process.env.TOKEN_PROCESS_ID,
      escrowProcess: process.env.ESCROW_PROCESS_ID,
      amount: job.budget.toString(),
      spender: process.env.ESCROW_PROCESS_ID,
      // Frontend will use these to prepare approval transaction
      approvalTags: [
        { name: 'Action', value: 'Approve' },
        { name: 'Spender', value: process.env.ESCROW_PROCESS_ID },
        { name: 'Quantity', value: job.budget.toString() }
      ]
    })
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

#### **Step 4: Escrow Deposit Creation**

```javascript
// API endpoint: POST /api/jobs/:jobId/deposit
app.post('/api/jobs/:jobId/deposit', async (req, res) => {
  try {
    const { jobId } = req.params
    const { clientSignature } = req.body // Client signs on frontend
    
    const job = await db.jobs.findById(jobId)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'pending') {
      return res.status(400).json({ error: 'Job already has escrow deposit' })
    }
    
    // Get user wallet addresses
    const client = await db.users.findById(job.client_id)
    const freelancer = await db.users.findById(job.freelancer_id)
    
    // Send deposit message (client must sign this)
    // Note: In practice, client signs this on frontend and sends messageId
    const messageId = await this.escrowService.createDeposit({
      jobId,
      clientAddress: client.wallet_address,
      freelancerAddress: freelancer.wallet_address,
      amount: job.budget.toString(),
      metadata: {
        title: job.title,
        description: job.description,
        deadline: job.deadline
      },
      clientSigner: clientSignature // Client's signature from frontend
    })
    
    // Update job status
    await db.jobs.update(jobId, {
      status: 'depositing',
      escrow_tx_id: messageId,
      deposited_at: new Date()
    })
    
    res.json({
      success: true,
      messageId,
      status: 'depositing',
      message: 'Deposit transaction sent. Waiting for confirmation.'
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// EscrowService method
async createDeposit({ jobId, clientAddress, freelancerAddress, amount, metadata, clientSigner }) {
  const messageId = await this.ao.message({
    process: this.escrowProcessId,
    tags: [
      { name: 'Action', value: 'Deposit' },
      { name: 'jobId', value: jobId },
      { name: 'client', value: clientAddress },
      { name: 'freelancer', value: freelancerAddress },
      { name: 'amount', value: amount },
      { name: 'meta', value: JSON.stringify(metadata) }
    ],
    signer: clientSigner // Client must sign this transaction
  })
  
  return messageId
}
```

#### **Step 5: Job Completion & Release**

```javascript
// API endpoint: POST /api/jobs/:jobId/release
app.post('/api/jobs/:jobId/release', async (req, res) => {
  try {
    const { jobId } = req.params
    const { clientSignature } = req.body
    
    const job = await db.jobs.findById(jobId)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'escrowed') {
      return res.status(400).json({ error: 'Job not in escrowed state' })
    }
    
    // Verify client is authorized to release
    const client = await db.users.findById(job.client_id)
    
    // Send release message
    const messageId = await this.escrowService.releaseFunds({
      jobId,
      clientSigner: clientSignature
    })
    
    // Update job status
    await db.jobs.update(jobId, {
      status: 'releasing',
      release_tx_id: messageId,
      release_initiated_at: new Date()
    })
    
    res.json({
      success: true,
      messageId,
      status: 'releasing',
      message: 'Release transaction sent. Freelancer will receive payment shortly.'
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// EscrowService method
async releaseFunds({ jobId, clientSigner }) {
  const messageId = await this.ao.message({
    process: this.escrowProcessId,
    tags: [
      { name: 'Action', value: 'Release' },
      { name: 'jobId', value: jobId }
    ],
    signer: clientSigner // Only client can release funds
  })
  
  return messageId
}
```

#### **Step 6: Refund Process**

```javascript
// API endpoint: POST /api/jobs/:jobId/refund
app.post('/api/jobs/:jobId/refund', async (req, res) => {
  try {
    const { jobId } = req.params
    const { clientSignature, reason } = req.body
    
    const job = await db.jobs.findById(jobId)
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    if (job.status !== 'escrowed') {
      return res.status(400).json({ error: 'Job not in escrowed state' })
    }
    
    // Send refund message
    const messageId = await this.escrowService.refundFunds({
      jobId,
      clientSigner: clientSignature
    })
    
    // Update job status and store refund reason
    await db.jobs.update(jobId, {
      status: 'refunding',
      refund_tx_id: messageId,
      refund_reason: reason,
      refund_initiated_at: new Date()
    })
    
    res.json({
      success: true,
      messageId,
      status: 'refunding',
      message: 'Refund transaction sent. Client will receive refund shortly.'
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// EscrowService method
async refundFunds({ jobId, clientSigner }) {
  const messageId = await this.ao.message({
    process: this.escrowProcessId,
    tags: [
      { name: 'Action', value: 'Refund' },
      { name: 'jobId', value: jobId }
    ],
    signer: clientSigner // Only client can initiate refund
  })
  
  return messageId
}
```

#### **Step 7: Event Monitoring & Database Sync**

```javascript
// Event monitoring service - runs continuously
class EscrowEventMonitor {
  constructor(escrowService, database) {
    this.escrowService = escrowService
    this.db = database
    this.lastCursor = null
    this.polling = false
  }
  
  async startMonitoring() {
    if (this.polling) return
    this.polling = true
    
    // Load last cursor from database
    this.lastCursor = await this.db.getSetting('last_event_cursor')
    
    // Poll every 10 seconds
    setInterval(() => {
      this.pollEvents().catch(console.error)
    }, 10000)
  }
  
  async pollEvents() {
    try {
      const results = await this.escrowService.ao.results({
        process: this.escrowService.escrowProcessId,
        from: this.lastCursor,
        limit: 50
      })
      
      for (const edge of results.edges) {
        await this.processEvent(edge.node)
      }
      
      // Update cursor
      if (results.edges.length > 0) {
        this.lastCursor = results.edges[results.edges.length - 1].cursor
        await this.db.setSetting('last_event_cursor', this.lastCursor)
      }
      
    } catch (error) {
      console.error('Error polling events:', error)
    }
  }
  
  async processEvent(result) {
    // Parse result for escrow events
    if (!result.Output?.data) return
    
    try {
      const event = JSON.parse(result.Output.data)
      if (!event._v || !event.event) return // Not an escrow event
      
      // Check if already processed
      const existing = await this.db.escrowEvents.findByResultId(result.id)
      if (existing) return
      
      // Process based on event type
      switch (event.event) {
        case 'Deposited':
          await this.handleDepositEvent(event, result.id)
          break
        case 'Released':
          await this.handleReleaseEvent(event, result.id)
          break
        case 'Refunded':
          await this.handleRefundEvent(event, result.id)
          break
      }
      
      // Store raw event
      await this.db.escrowEvents.create({
        result_id: result.id,
        job_id: event.jobId,
        event_type: event.event,
        event_data: event,
        processed_at: new Date()
      })
      
    } catch (error) {
      console.error('Error processing event:', error)
    }
  }
  
  async handleDepositEvent(event, resultId) {
    // Update job status to escrowed
    await this.db.jobs.update(event.jobId, {
      status: 'escrowed',
      escrow_amount: event.amount,
      escrowed_at: new Date()
    })
    
    // Notify freelancer work can start
    await this.notifyUser(event.freelancer, 'work_can_start', {
      jobId: event.jobId,
      amount: event.amount
    })
    
    // Notify client deposit confirmed
    await this.notifyUser(event.client, 'deposit_confirmed', {
      jobId: event.jobId,
      amount: event.amount
    })
  }
  
  async handleReleaseEvent(event, resultId) {
    // Update job status to completed
    await this.db.jobs.update(event.jobId, {
      status: 'completed',
      freelancer_payout: event.payout,
      platform_fee: event.fee,
      completed_at: new Date()
    })
    
    // Notify both parties
    const job = await this.db.jobs.findById(event.jobId)
    await this.notifyUser(job.freelancer_id, 'payment_received', {
      jobId: event.jobId,
      amount: event.payout,
      fee: event.fee
    })
    
    await this.notifyUser(job.client_id, 'job_completed', {
      jobId: event.jobId,
      totalPaid: event.amount
    })
  }
  
  async handleRefundEvent(event, resultId) {
    // Update job status to refunded
    await this.db.jobs.update(event.jobId, {
      status: 'refunded',
      refund_amount: event.amount,
      refunded_at: new Date()
    })
    
    // Notify both parties
    const job = await this.db.jobs.findById(event.jobId)
    await this.notifyUser(job.client_id, 'refund_processed', {
      jobId: event.jobId,
      amount: event.amount
    })
    
    await this.notifyUser(job.freelancer_id, 'job_refunded', {
      jobId: event.jobId
    })
  }
  
  async notifyUser(userId, eventType, data) {
    // Implement your notification system
    // Could be email, push notifications, websockets, etc.
    console.log(`Notify user ${userId}: ${eventType}`, data)
  }
}
```

#### **Step 8: Status & Query Endpoints**

```javascript
// API endpoint: GET /api/jobs/:jobId/status
app.get('/api/jobs/:jobId/status', async (req, res) => {
  try {
    const { jobId } = req.params
    const job = await db.jobs.findById(jobId)
    
    if (!job) {
      return res.status(404).json({ error: 'Job not found' })
    }
    
    // Get escrow status from contract
    const escrowStatus = await this.escrowService.getJobStatus(jobId)
    
    res.json({
      jobId: job.id,
      title: job.title,
      status: job.status,
      escrowStatus: escrowStatus?.state || 'unknown',
      amount: job.budget,
      escrowAmount: job.escrow_amount,
      freelancerPayout: job.freelancer_payout,
      platformFee: job.platform_fee,
      createdAt: job.created_at,
      escrowedAt: job.escrowed_at,
      completedAt: job.completed_at,
      refundedAt: job.refunded_at,
      client: {
        id: job.client_id,
        // Add client details as needed
      },
      freelancer: {
        id: job.freelancer_id,
        // Add freelancer details as needed
      }
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})

// EscrowService method
async getJobStatus(jobId) {
  try {
    const result = await this.ao.dryrun({
      process: this.escrowProcessId,
      tags: [
        { name: 'Action', value: 'GetJob' },
        { name: 'jobId', value: jobId }
      ]
    })
    
    if (result.Messages?.[0]?.Data) {
      return JSON.parse(result.Messages[0].Data)
    }
    
    return null
  } catch (error) {
    console.error('Error getting job status:', error)
    return null
  }
}

// API endpoint: GET /api/escrow/config
app.get('/api/escrow/config', async (req, res) => {
  try {
    const config = await this.escrowService.getEscrowConfig()
    
    res.json({
      escrowProcess: process.env.ESCROW_PROCESS_ID,
      tokenProcess: process.env.TOKEN_PROCESS_ID,
      platformFee: config?.fee || 100, // basis points
      treasury: config?.treasury,
      owner: config?.owner
    })
    
  } catch (error) {
    res.status(500).json({ error: error.message })
  }
})
```

### 🗄️ Database Schema

```sql
-- Jobs table
CREATE TABLE jobs (
  id VARCHAR(255) PRIMARY KEY,
  title VARCHAR(500) NOT NULL,
  description TEXT,
  budget BIGINT NOT NULL, -- in token smallest units
  client_id VARCHAR(255) NOT NULL,
  freelancer_id VARCHAR(255) NOT NULL,
  status VARCHAR(50) DEFAULT 'pending', -- pending, depositing, escrowed, releasing, completed, refunding, refunded
  escrow_amount BIGINT,
  freelancer_payout BIGINT,
  platform_fee BIGINT,
  escrow_tx_id VARCHAR(255), -- deposit message ID
  release_tx_id VARCHAR(255), -- release message ID  
  refund_tx_id VARCHAR(255), -- refund message ID
  refund_reason TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  deposited_at TIMESTAMP,
  escrowed_at TIMESTAMP,
  release_initiated_at TIMESTAMP,
  completed_at TIMESTAMP,
  refund_initiated_at TIMESTAMP,
  refunded_at TIMESTAMP,
  
  INDEX idx_client_id (client_id),
  INDEX idx_freelancer_id (freelancer_id),
  INDEX idx_status (status),
  INDEX idx_created_at (created_at)
);

-- Escrow events table
CREATE TABLE escrow_events (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  result_id VARCHAR(255) UNIQUE NOT NULL, -- AO result ID for idempotency
  job_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(50) NOT NULL, -- Deposited, Released, Refunded
  event_data JSON NOT NULL, -- full event object
  processed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_job_id (job_id),
  INDEX idx_event_type (event_type),
  INDEX idx_processed_at (processed_at),
  FOREIGN KEY (job_id) REFERENCES jobs(id)
);

-- Settings table for cursor tracking
CREATE TABLE settings (
  key_name VARCHAR(255) PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Users table (adjust based on your user system)
CREATE TABLE users (
  id VARCHAR(255) PRIMARY KEY,
  wallet_address VARCHAR(255) UNIQUE NOT NULL,
  email VARCHAR(255),
  username VARCHAR(255),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  
  INDEX idx_wallet_address (wallet_address)
);
```

### 🔐 Security Considerations

```javascript
// Input validation middleware
const validateJobCreation = (req, res, next) => {
  const { title, description, budget, clientId, freelancerId } = req.body
  
  if (!title || title.length > 500) {
    return res.status(400).json({ error: 'Invalid title' })
  }
  
  if (!budget || budget < 1000) { // minimum 1000 token units
    return res.status(400).json({ error: 'Budget too small' })
  }
  
  if (!clientId || !freelancerId) {
    return res.status(400).json({ error: 'Client and freelancer required' })
  }
  
  if (clientId === freelancerId) {
    return res.status(400).json({ error: 'Client and freelancer must be different' })
  }
  
  next()
}

// Rate limiting
const escrowRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // limit each IP to 10 escrow operations per windowMs
  message: 'Too many escrow operations, please try again later'
})

// Apply rate limiting to sensitive endpoints
app.use('/api/jobs/:id/deposit', escrowRateLimit)
app.use('/api/jobs/:id/release', escrowRateLimit)
app.use('/api/jobs/:id/refund', escrowRateLimit)

// Signature verification (implement based on your auth system)
const verifyClientSignature = async (req, res, next) => {
  const { jobId } = req.params
  const { clientSignature } = req.body
  
  // Verify the signature belongs to the job's client
  const job = await db.jobs.findById(jobId)
  const client = await db.users.findById(job.client_id)
  
  // Implement signature verification logic
  // This ensures only the actual client can release/refund
  
  next()
}
```
