-- DecentEscrow AO
local json = require('json')

-- =========================
-- Persistent config/state
-- =========================
local Owner = Owner or nil
local Paused = Paused or false
local arbiter = arbiter or nil                 -- arbiter address allowed to decide disputes
local platformTreasury = platformTreasury or nil
local platformFeeBps = platformFeeBps or 500   -- default 5% -> 500 bps
local MAX_PLATFORM_FEE_BPS = 1000              -- owner cannot set more than this (10%)

-- AR token process id. Replace with testnet AR token process id if required by your environment.
local AR_TOKEN = 'agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA'     
local defaultToken = AR_TOKEN

-- Jobs and tombstones
local jobs = jobs or {}                        -- jobId -> job object
local usedJobIds = usedJobIds or {}            -- jobId -> true once ever used

-- pending balances for pull payouts: pending[addr][token] = amountStr
local pending = pending or {}

local EVENT_VERSION = 1

-- =========================
-- Utilities & large-int math
-- =========================
local function now() return tonumber(os.time()) end

local function emit(event, data)
  data = data or {}
  data._v = EVENT_VERSION
  if ao.emit then
    ao.emit(event, json.encode(data))
  else
    ao.send({ Target = ao.id, Action = 'Event', Event = event, Data = json.encode(data) })
  end
end

local function ensure(cond, msg)
  if not cond then error(msg) end
end

local function isEmpty(x) return x == nil or x == '' end
local function isValidAddr(a) return type(a) == 'string' and #a > 10 end

local function safeToNumber(x)
  local n = tonumber(x)
  ensure(n ~= nil, 'Invalid number')
  return n
end

-- Read a tag value from msg or msg.Tags list
local function getTag(msg, key)
  local direct = msg[key]
  if direct ~= nil and direct ~= '' then return direct end
  local tags = msg.Tags or msg.tags
  if type(tags) == 'table' then
    for _, t in ipairs(tags) do
      if t and t.name == key then
        return t.value
      end
    end
  end
  return nil
end

-- string big-int helpers (non-negative integers only)
local function isDigits(s) return type(s) == 'string' and s:match('^%d+$') ~= nil end
local function trimZeros(s) local t = s:gsub('^0+','') return (#t==0) and '0' or t end
local function cmp(a,b) a,b = trimZeros(a), trimZeros(b) if #a ~= #b then return (#a > #b) and 1 or -1 end if a==b then return 0 end return (a>b) and 1 or -1 end

local function add(a,b)
  a,b = trimZeros(a), trimZeros(b)
  a,b = a:reverse(), b:reverse()
  local carry, out = 0, {}
  local n = math.max(#a,#b)
  for i=1,n do
    local da = tonumber(a:sub(i,i)) or 0
    local db = tonumber(b:sub(i,i)) or 0
    local s = da + db + carry
    table.insert(out, tostring(s % 10))
    carry = math.floor(s / 10)
  end
  if carry > 0 then table.insert(out, tostring(carry)) end
  return trimZeros(table.concat(out):reverse())
end

local function sub(a,b)
  ensure(cmp(a,b) >= 0, 'underflow')
  a,b = trimZeros(a), trimZeros(b)
  a,b = a:reverse(), b:reverse()
  local borrow, out = 0, {}
  local n = math.max(#a,#b)
  for i=1,n do
    local da = tonumber(a:sub(i,i)) or 0
    local db = tonumber(b:sub(i,i)) or 0
    local s = da - db - borrow
    if s < 0 then s = s + 10; borrow = 1 else borrow = 0 end
    table.insert(out, tostring(s))
  end
  return trimZeros(table.concat(out):reverse())
end

local function mulSmall(a,m)
  ensure(isDigits(a), 'mulSmall expects digits string')
  ensure(type(m)=='number' and m >= 0, 'mulSmall multiplier invalid')
  local carry, out = 0, {}
  a = a:reverse()
  for i=1,#a do
    local da = tonumber(a:sub(i,i)) or 0
    local p = da * m + carry
    table.insert(out, tostring(p % 10))
    carry = math.floor(p / 10)
  end
  while carry > 0 do
    table.insert(out, tostring(carry % 10))
    carry = math.floor(carry / 10)
  end
  return trimZeros(table.concat(out):reverse())
end

local function divSmall(a,d)
  ensure(isDigits(a), 'divSmall expects digits string')
  ensure(type(d)=='number' and d > 0, 'divSmall divisor invalid')
  local out, rem = {}, 0
  for i=1,#a do
    local digit = tonumber(a:sub(i,i))
    local cur = rem * 10 + digit
    local q = math.floor(cur / d)
    rem = cur % d
    table.insert(out, tostring(q))
  end
  return trimZeros(table.concat(out)), rem
end

local function bps(amountStr, bpsVal)
  ensure(isDigits(amountStr), 'bps expects digits string')
  local prod = mulSmall(amountStr, bpsVal)
  local q, _ = divSmall(prod, 10000)
  return q
end

-- pending accounting
local function credit(addr, token, amountStr)
  ensure(not isEmpty(addr), 'credit missing addr')
  ensure(not isEmpty(token), 'credit missing token')
  ensure(isDigits(amountStr) and cmp(amountStr,'0') >= 0, 'credit invalid amount')
  if pending[addr] == nil then pending[addr] = {} end
  local cur = pending[addr][token] or '0'
  pending[addr][token] = add(cur, amountStr)
end

local function getPending(addr, token)
  local tmap = pending[addr]
  if not tmap then return '0' end
  return tmap[token] or '0'
end

local function deduct(addr, token, amountStr)
  local cur = getPending(addr, token)
  ensure(cmp(cur, amountStr) >= 0, 'Insufficient pending balance')
  local nextAmt = sub(cur, amountStr)
  if pending[addr] == nil then pending[addr] = {} end
  pending[addr][token] = nextAmt
end

-- =========================
-- Token transfer wrappers
-- NOTE: Modified to use direct Transfer instead of TransferFrom for tARIO compatibility
-- =========================
local function tokenTransfer(token, to, qty)
  ensure(not isEmpty(token), 'token missing')
  ensure(not isEmpty(to), 'to missing')
  ensure(isDigits(qty) and cmp(qty,'0') > 0, 'qty must be positive digits string')
  local ok, ret = pcall(function()
    return ao.send({
      Target = token,
      Action = 'Transfer',
      To = to,
      Quantity = tostring(qty),
    })
  end)
  if not ok then return false, tostring(ret) end
  if ret == nil or ret == false or tostring(ret) == 'false' then
    return false, tostring(ret)
  end
  return true, ret
end

-- Token balance tracking for deposit verification
local receivedTokens = receivedTokens or {} -- token -> sender -> amount (temporary tracking)

-- Handler to receive token transfers
Handlers.add('Credit-Notice', Handlers.utils.hasMatchingTag('Action', 'Credit-Notice'), function(msg)
  local token = msg.From -- The token process sending the credit notice
  local sender = getTag(msg, 'Sender') or msg.Sender
  local quantity = getTag(msg, 'Quantity') or msg.Quantity
  
  if not sender or not quantity then return end
  
  -- Track received tokens for deposit verification
  if receivedTokens[token] == nil then receivedTokens[token] = {} end
  if receivedTokens[token][sender] == nil then receivedTokens[token][sender] = '0' end
  
  receivedTokens[token][sender] = add(receivedTokens[token][sender], quantity)
  
  emit('TokenReceived', { 
    token = token, 
    sender = sender, 
    quantity = quantity, 
    total = receivedTokens[token][sender]
  })
end)

-- Helper function to check and consume received tokens
local function consumeReceivedTokens(token, sender, amount)
  if receivedTokens[token] == nil or receivedTokens[token][sender] == nil then
    return false, 'No tokens received from sender'
  end
  
  local available = receivedTokens[token][sender]
  if cmp(available, amount) < 0 then
    return false, 'Insufficient tokens received'
  end
  
  -- Consume the tokens
  receivedTokens[token][sender] = sub(available, amount)
  return true, 'Tokens consumed'
end

-- =========================
-- State helpers
-- =========================
local function isFinalState(status)
  return status == 'released' or status == 'refunded' or status == 'cancelled'
end

local function assertOwner(caller)
  ensure(Owner ~= nil and caller == Owner, 'Unauthorized: owner only')
end

-- =========================
-- Handlers: Admin & config
-- =========================
Handlers.add('InitOwner', Handlers.utils.hasMatchingTag('Action', 'InitOwner'), function(msg)
  ensure(Owner == nil, 'Owner already set')
  ensure(isValidAddr(msg.From), 'Invalid owner address')
  Owner = msg.From
  emit('OwnerSet', { owner = Owner })
end)

Handlers.add('SetConfig', Handlers.utils.hasMatchingTag('Action', 'SetConfig'), function(msg)
  assertOwner(msg.From)
  local feeTag = getTag(msg, 'platformFeeBps')
  local treTag = getTag(msg, 'platformTreasury')
  local arbTag = getTag(msg, 'arbiter')
  -- Also accept JSON in msg.Data
  if type(msg.Data) == 'string' and #msg.Data > 0 then
    local ok, parsed = pcall(json.decode, msg.Data)
    if ok and type(parsed) == 'table' then
      feeTag = parsed.platformFeeBps or feeTag
      treTag = parsed.platformTreasury or treTag
      arbTag = parsed.arbiter or arbTag
    end
  end

  if feeTag ~= nil and feeTag ~= '' then
    local bpsVal = safeToNumber(feeTag)
    ensure(bpsVal >= 0 and bpsVal <= MAX_PLATFORM_FEE_BPS, 'platformFeeBps out of range')
    platformFeeBps = bpsVal
  end
  if not isEmpty(treTag) then
    ensure(isValidAddr(treTag), 'Invalid platformTreasury')
    platformTreasury = treTag
  end
  if not isEmpty(arbTag) then
    ensure(isValidAddr(arbTag), 'Invalid arbiter')
    arbiter = arbTag
  end
  emit('ConfigUpdated', { platformFeeBps = platformFeeBps, platformTreasury = platformTreasury, arbiter = arbiter })
end)

Handlers.add('Pause', Handlers.utils.hasMatchingTag('Action', 'Pause'), function(msg)
  assertOwner(msg.From)
  Paused = true
  emit('Paused', { by = msg.From })
end)

Handlers.add('Unpause', Handlers.utils.hasMatchingTag('Action', 'Unpause'), function(msg)
  assertOwner(msg.From)
  Paused = false
  emit('Unpaused', { by = msg.From })
end)

Handlers.add('TransferOwnership', Handlers.utils.hasMatchingTag('Action', 'TransferOwnership'), function(msg)
  assertOwner(msg.From)
  ensure(not isEmpty(msg.newOwner), 'Missing newOwner')
  ensure(isValidAddr(msg.newOwner), 'Invalid newOwner')
  Owner = msg.newOwner
  emit('OwnerSet', { owner = Owner })
end)

-- =========================
-- Deposit: create new job using received tokens
-- Two-step process: 1) Client transfers tokens to escrow, 2) Client calls Deposit
-- This is compatible with tARIO and other direct-transfer tokens
-- =========================
Handlers.add('Deposit', Handlers.utils.hasMatchingTag('Action', 'Deposit'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(getTag(msg, 'jobId') or msg.jobId)
  local client = msg.From
  local token = getTag(msg, 'token') or defaultToken
  local amount = tostring(getTag(msg, 'amount') or msg.amount or '')
  local meta = getTag(msg, 'meta') or msg.meta
  if (not meta) and type(msg.Data) == 'string' and #msg.Data > 0 then
    local ok, parsed = pcall(json.decode, msg.Data)
    if ok and type(parsed) == 'table' then meta = parsed.meta or meta end
  end

  ensure(not isEmpty(jobId), 'Missing jobId')
  ensure(isValidAddr(client), 'Invalid client address')
  ensure(isDigits(amount) and cmp(amount, '0') > 0, 'Amount must be positive integer string')
  ensure(not usedJobIds[jobId], 'JobId already used')
  ensure(not isEmpty(token), 'Token not set')

  if meta ~= nil then
    local mstr
    if type(meta) == 'string' then mstr = meta else
      local ok,s = pcall(json.encode, meta)
      ensure(ok, 'Meta serialization failed')
      mstr = s
    end
    ensure(#mstr <= 2048, 'meta too long')
  end

  -- Check if client has transferred sufficient tokens to escrow
  local ok, reason = consumeReceivedTokens(token, client, amount)
  if not ok then
    local available = '0'
    if receivedTokens[token] and receivedTokens[token][client] then
      available = receivedTokens[token][client]
    end
    emit('DepositFailed', {
      stage = 'TokenVerification',
      jobId = jobId,
      by = client,
      reason = reason,
      required = amount,
      available = available,
      token = token,
      instruction = 'Perform Transfer -> wait for Credit-Notice (poll GetReceivedTokens) -> Deposit'
    })
    error('Deposit failed: need '..amount..' got '..available..' ('..tostring(reason)..')')
  end

  local nowTs = now()
  jobs[jobId] = {
    jobId = jobId,
    client = client,
    freelancer = nil,
    token = token,
    amount = amount,
    status = 'funded',
    createdAt = nowTs,
    meta = meta,
    dispute = nil,
    cancelRequest = nil,     -- for mutual cancel flow
    cancelApprovedBy = nil,
  }
  usedJobIds[jobId] = true

  emit('Deposited', { 
    jobId = jobId, 
    client = client, 
    amount = amount, 
    token = token, 
    createdAt = nowTs,
    method = 'direct-transfer'
  })
end)

-- =========================
-- AssignFreelancer: client assigns freelancer -> locked
-- =========================
Handlers.add('AssignFreelancer', Handlers.utils.hasMatchingTag('Action', 'AssignFreelancer'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(getTag(msg, 'jobId') or msg.jobId)
  local freelancer = getTag(msg, 'freelancer') or msg.freelancer
  ensure(not isEmpty(jobId), 'Missing jobId')
  ensure(isValidAddr(freelancer), 'Invalid freelancer address')

  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'funded', 'Job must be funded to assign freelancer')
  ensure(msg.From == job.client, 'Only client can assign freelancer')
  ensure(freelancer ~= job.client, 'Client cannot be freelancer')

  job.freelancer = freelancer
  job.status = 'locked'
  job.assignedAt = now()
  emit('FreelancerAssigned', { jobId = jobId, client = job.client, freelancer = freelancer, assignedAt = job.assignedAt })
end)

-- =========================
-- CancelUnassigned: client can cancel funded job before assignment -> refund
-- (keeps previous behavior but explicit)
-- =========================
Handlers.add('CancelUnassigned', Handlers.utils.hasMatchingTag('Action', 'CancelUnassigned'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  ensure(not isEmpty(jobId), 'Missing jobId')

  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'funded', 'Job must be funded to cancel')
  ensure(job.freelancer == nil, 'Cannot cancel job after freelancer assigned')
  ensure(msg.From == job.client, 'Only client can cancel')

  credit(job.client, job.token, job.amount)
  job.status = 'cancelled'
  job.cancelledAt = now()
  emit('JobCancelled', { jobId = jobId, client = job.client, amount = job.amount, cancelledAt = job.cancelledAt })
end)

-- =========================
-- Mutual cancel flow for locked jobs:
-- RequestCancel: either party requests cancellation
-- ApproveCancel: the counterparty approves; on approval refund to client and finalize cancelled
-- This prevents a unilateral refund by client after assignment
-- =========================
Handlers.add('RequestCancel', Handlers.utils.hasMatchingTag('Action', 'RequestCancel'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local caller = msg.From
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Can only request cancel when job is locked')
  ensure(caller == job.client or caller == job.freelancer, 'Only job parties can request cancel')
  job.cancelRequest = { requestedBy = caller, requestedAt = now() }
  job.cancelApprovedBy = nil
  emit('CancelRequested', { jobId = jobId, by = caller, requestedAt = job.cancelRequest.requestedAt })
end)

Handlers.add('ApproveCancel', Handlers.utils.hasMatchingTag('Action', 'ApproveCancel'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local caller = msg.From
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Can only approve cancel when job is locked')
  ensure(job.cancelRequest ~= nil, 'No cancel request present')
  local other = (caller == job.client) and job.freelancer or ((caller == job.freelancer) and job.client or nil)
  ensure(other ~= nil, 'Invalid approver')
  ensure(caller ~= job.cancelRequest.requestedBy, 'Requester cannot approve own request')
  -- Approve and refund to client
  credit(job.client, job.token, job.amount)
  job.cancelApprovedBy = caller
  job.status = 'cancelled'
  job.cancelledAt = now()
  -- clear dispute/cancelRequest fields
  job.dispute = nil
  job.cancelRequest = nil
  emit('JobCancelled', { jobId = jobId, by = caller, client = job.client, freelancer = job.freelancer, cancelledAt = job.cancelledAt })
end)

-- =========================
-- OpenDispute: either party can open dispute while locked
-- =========================
Handlers.add('OpenDispute', Handlers.utils.hasMatchingTag('Action', 'OpenDispute'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local caller = msg.From
  local reason = msg.reason
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Can only dispute when job is locked')
  ensure(caller == job.client or caller == job.freelancer, 'Only job parties can open dispute')
  ensure(job.freelancer ~= nil, 'No freelancer assigned')
  if type(reason) == 'string' then ensure(#reason <= 1024, 'reason too long') end

  job.dispute = { openedBy = caller, reason = reason, openedAt = now() }
  job.status = 'disputed'
  emit('DisputeOpened', { jobId = jobId, openedBy = caller, reason = reason, openedAt = job.dispute.openedAt })
end)

-- =========================
-- DecideDispute: arbiter resolves dispute; only arbiter can call
-- outcome = 'release' or 'refund'
-- =========================
Handlers.add('DecideDispute', Handlers.utils.hasMatchingTag('Action', 'DecideDispute'), function(msg)
  ensure(not Paused, 'Paused')
  ensure(arbiter ~= nil, 'No arbiter configured')
  ensure(msg.From == arbiter, 'Only arbiter can decide disputes')
  local jobId = tostring(msg.jobId)
  local outcome = msg.outcome
  ensure(outcome == 'release' or outcome == 'refund', 'Invalid outcome')
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'disputed', 'Job must be disputed to decide')
  ensure(job.dispute ~= nil, 'No active dispute')

  local amount = job.amount
  local fee = '0'
  if outcome == 'release' and platformFeeBps and platformFeeBps > 0 and platformTreasury and not isEmpty(platformTreasury) then
    fee = bps(amount, platformFeeBps)
  end
  ensure(cmp(amount, fee) >= 0, 'Fee exceeds amount')

  if outcome == 'release' then
    local payout = sub(amount, fee)
    if cmp(fee, '0') > 0 then credit(platformTreasury, job.token, fee) end
    if cmp(payout, '0') > 0 then credit(job.freelancer, job.token, payout) end
    job.status = 'released'
    job.releasedAt = now()
    job.dispute = nil
    emit('Released', { jobId = jobId, by = 'arbiter', client = job.client, freelancer = job.freelancer, amount = amount, fee = fee, payout = payout, mode = 'pull' })
  else
    -- refund outcome
    credit(job.client, job.token, amount)
    job.status = 'refunded'
    job.refundedAt = now()
    job.dispute = nil
    emit('Refunded', { jobId = jobId, by = 'arbiter', client = job.client, amount = amount, mode = 'pull' })
  end
end)

-- =========================
-- Release: client can release funds to freelancer only when locked
-- This is the normal happy-path: client accepts work and releases funds
-- =========================
Handlers.add('Release', Handlers.utils.hasMatchingTag('Action', 'Release'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(getTag(msg, 'jobId') or msg.jobId)
  local caller = msg.From
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job must be locked to release')
  ensure(caller == job.client, 'Only client can release funds')
  ensure(job.freelancer ~= nil and not isEmpty(job.freelancer), 'No freelancer assigned')

  local amount = job.amount
  local fee = '0'
  if platformFeeBps and platformFeeBps > 0 and platformTreasury and not isEmpty(platformTreasury) then
    fee = bps(amount, platformFeeBps)
  end
  ensure(cmp(amount, fee) >= 0, 'Fee exceeds amount')
  local payout = sub(amount, fee)

  if cmp(fee, '0') > 0 then credit(platformTreasury, job.token, fee) end
  if cmp(payout, '0') > 0 then credit(job.freelancer, job.token, payout) end

  job.status = 'released'
  job.releasedAt = now()
  emit('Released', { jobId = jobId, by = 'client', client = job.client, freelancer = job.freelancer, amount = amount, fee = fee, payout = payout, mode = 'pull' })
end)

-- =========================
-- Claim: withdraw pending balance for caller (pull)
-- Reserve-first pattern, restore on failure
-- =========================
Handlers.add('Claim', Handlers.utils.hasMatchingTag('Action', 'Claim'), function(msg)
  ensure(not Paused, 'Paused')
  local claimant = msg.From
  local token = getTag(msg, 'token') or msg.token or defaultToken
  ensure(not isEmpty(token), 'Missing token')
  local available = getPending(claimant, token)
  ensure(cmp(available, '0') > 0, 'Nothing to claim')

  local reqAmt = getTag(msg, 'amount') or msg.amount
  if (not reqAmt) and type(msg.Data) == 'string' and #msg.Data > 0 then
    local ok, parsed = pcall(json.decode, msg.Data)
    if ok and type(parsed) == 'table' then reqAmt = parsed.amount or reqAmt end
  end
  local amount = tostring(reqAmt or available)
  ensure(isDigits(amount) and cmp(amount,'0') > 0, 'Invalid amount')
  ensure(cmp(available, amount) >= 0, 'Amount exceeds pending')

  -- Reserve first
  deduct(claimant, token, amount)

  -- External transfer
  local ok, reason = tokenTransfer(token, claimant, amount)
  if not ok then
    -- restore pending on failure
    credit(claimant, token, amount)
    emit('TransferFailed', { stage = 'Claim', address = claimant, token = token, amount = amount, reason = reason })
    return
  end

  emit('Claimed', { address = claimant, token = token, amount = amount })
end)

-- =========================
-- Views
-- =========================
Handlers.add('GetJob', Handlers.utils.hasMatchingTag('Action', 'GetJob'), function(msg)
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ao.send({ Target = msg.From, Action = 'GetJobResult', JobId = jobId, Data = json.encode(job or {}) })
end)

Handlers.add('ListJobs', Handlers.utils.hasMatchingTag('Action', 'ListJobs'), function(msg)
  local res = {}
  local count = 0
  local limit = tonumber(msg.limit or 50)
  for id, j in pairs(jobs) do
    table.insert(res, { id = id, status = j.status, client = j.client, freelancer = j.freelancer, token = j.token, amount = j.amount })
    count = count + 1
    if count >= limit then break end
  end
  ao.send({ Target = msg.From, Action = 'ListJobsResult', Data = json.encode(res) })
end)

Handlers.add('GetPending', Handlers.utils.hasMatchingTag('Action', 'GetPending'), function(msg)
  local addr = msg.addr or msg.From
  local res = {}
  if pending[addr] then
    for t, amt in pairs(pending[addr]) do
      table.insert(res, { token = t, amount = amt })
    end
  end
  ao.send({ Target = msg.From, Action = 'GetPendingResult', Address = addr, Data = json.encode(res) })
end)

Handlers.add('GetConfig', Handlers.utils.hasMatchingTag('Action', 'GetConfig'), function(msg)
  local cfg = {
    Owner = Owner,
    Paused = Paused,
    arbiter = arbiter or '',
    platformTreasury = platformTreasury or '',
    platformFeeBps = platformFeeBps,
    defaultToken = defaultToken,
    transferMethod = 'direct-transfer', -- Indicate we use direct transfer now
  }
  ao.send({ Target = msg.From, Action = 'GetConfigResult', Data = json.encode(cfg) })
end)

-- Check received tokens for a user (for deposit preparation)
Handlers.add('GetReceivedTokens', Handlers.utils.hasMatchingTag('Action', 'GetReceivedTokens'), function(msg)
  local addr = msg.addr or msg.From
  local token = msg.token or defaultToken
  local res = {}
  
  if receivedTokens[token] and receivedTokens[token][addr] then
    res.available = receivedTokens[token][addr]
  else
    res.available = '0'
  end
  
  res.token = token
  res.address = addr
  
  ao.send({ Target = msg.From, Action = 'GetReceivedTokensResult', Data = json.encode(res) })
end)

-- =========================
-- Updated Receive handler for direct transfer compatibility
-- =========================
Handlers.add('Receive', Handlers.utils.hasMatchingTag('Action', 'Receive'), function(msg)
  -- This contract now supports direct token transfers via Credit-Notice
  -- Clients should: 1) Transfer tokens to escrow, 2) Call Deposit action
  emit('DirectReceiveAttempt', { 
    from = msg.From, 
    instruction = 'Use two-step process: Transfer tokens first, then call Deposit action' 
  })
end)

-- =========================
-- Debug: enumerate received token buckets for an address (or all, owner only)
-- Action=GetReceivedDetail, optional tag 'addr'
-- WARNING: Iterating all senders can be large; restrict when possible.
-- =========================
Handlers.add('GetReceivedDetail', Handlers.utils.hasMatchingTag('Action', 'GetReceivedDetail'), function(msg)
  local caller = msg.From
  local addrFilter = getTag(msg, 'addr') or msg.addr
  local tokenFilter = getTag(msg, 'token') or msg.token
  local result = { entries = {}, filtered = false }

  if addrFilter and addrFilter ~= '' then
    result.filtered = true
    if tokenFilter and tokenFilter ~= '' then
      local amt = '0'
      if receivedTokens[tokenFilter] and receivedTokens[tokenFilter][addrFilter] then
        amt = receivedTokens[tokenFilter][addrFilter]
      end
      table.insert(result.entries, { token = tokenFilter, address = addrFilter, amount = amt })
    else
      for t, senders in pairs(receivedTokens) do
        local amt = senders[addrFilter]
        if amt then table.insert(result.entries, { token = t, address = addrFilter, amount = amt }) end
      end
    end
  else
    -- Only owner can enumerate all to avoid info leakage
    if Owner == nil or caller ~= Owner then
      ao.send({ Target = caller, Action = 'GetReceivedDetailResult', Data = json.encode({ error = 'Owner only or provide addr filter' }) })
      return
    end
    for t, senders in pairs(receivedTokens) do
      for addr, amt in pairs(senders) do
        table.insert(result.entries, { token = t, address = addr, amount = amt })
      end
    end
  end
  ao.send({ Target = caller, Action = 'GetReceivedDetailResult', Data = json.encode(result) })
end)
