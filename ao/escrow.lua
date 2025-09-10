

local json = require('json')

-- State
local jobs = jobs or {}               -- jobId => { client, freelancer, token, amount (string), status, createdAt, meta, dispute }
local platformFeeBps = platformFeeBps or 0 -- basis points (1% = 100 bps)
local platformTreasury = platformTreasury or nil
local arbiter = arbiter or nil        -- optional arbiter address able to decide disputes
local timeoutSecs = timeoutSecs or 0  -- optional inactivity timeout allowing freelancer claim
local Owner = Owner or nil            -- set once
local Paused = Paused or false
local allowedTokens = allowedTokens or {} -- set of token process IDs
local defaultToken = defaultToken or nil   -- optional default token process ID
local enforceAllowlist = enforceAllowlist or false -- once enabled, always enforced

-- Helpers
local function now()
  return tonumber(os.time())
end

local EVENT_VERSION = 1
local function emit(event, data)
  data = data or {}
  data._v = EVENT_VERSION
  ao.emit(event, json.encode(data))
end

local function ensure(cond, msg)
  if not cond then error(msg) end
end

local function isEmpty(x)
  return x == nil or x == ''
end

local function safeToNumber(x)
  local n = tonumber(x)
  ensure(n ~= nil, 'Invalid number')
  return n
end

-- Big-int string math (non-negative integers only)
local function isDigits(s) return type(s) == 'string' and s:match('^%d+$') ~= nil end
local function trimZeros(s)
  local t = s:gsub('^0+', '')
  return (#t == 0) and '0' or t
end
local function cmp(a,b)
  a, b = trimZeros(a), trimZeros(b)
  if #a ~= #b then return (#a > #b) and 1 or -1 end
  if a == b then return 0 end
  return (a > b) and 1 or -1
end
local function add(a,b)
  a, b = a:reverse(), b:reverse()
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
  -- assumes a>=b
  ensure(cmp(a,b) >= 0, ' underflow')
  a, b = a:reverse(), b:reverse()
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
  ensure(d > 0, 'div by zero')
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
  -- fee = floor(amount * bps / 10000)
  local prod = mulSmall(amountStr, bpsVal)
  local q = divSmall(prod, 10000)
  return q
end

-- Configuration actions
Handlers.add('InitOwner', Handlers.utils.hasMatchingTag('Action', 'InitOwner'), function(msg)
  ensure(Owner == nil, 'Owner already set')
  Owner = msg.From
  emit('OwnerSet', { owner = Owner })
end)

Handlers.add('SetConfig', Handlers.utils.hasMatchingTag('Action', 'SetConfig'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  if msg.platformFeeBps ~= nil then platformFeeBps = safeToNumber(msg.platformFeeBps) end
  if not isEmpty(msg.platformTreasury) then platformTreasury = msg.platformTreasury end
  if not isEmpty(msg.arbiter) then arbiter = msg.arbiter end
  if msg.timeoutSecs ~= nil then timeoutSecs = safeToNumber(msg.timeoutSecs) end
  emit('ConfigUpdated', { platformFeeBps = platformFeeBps, platformTreasury = platformTreasury, arbiter = arbiter, timeoutSecs = timeoutSecs })
end)

Handlers.add('Pause', Handlers.utils.hasMatchingTag('Action', 'Pause'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  Paused = true
  emit('Paused', { by = msg.From })
end)

Handlers.add('Unpause', Handlers.utils.hasMatchingTag('Action', 'Unpause'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  Paused = false
  emit('Unpaused', { by = msg.From })
end)

Handlers.add('AllowToken', Handlers.utils.hasMatchingTag('Action', 'AllowToken'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  ensure(not isEmpty(msg.token), 'Missing token')
  allowedTokens[msg.token] = true
  enforceAllowlist = true
  emit('TokenAllowed', { token = msg.token })
end)

Handlers.add('DisallowToken', Handlers.utils.hasMatchingTag('Action', 'DisallowToken'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  ensure(not isEmpty(msg.token), 'Missing token')
  allowedTokens[msg.token] = nil
  emit('TokenDisallowed', { token = msg.token })
end)

Handlers.add('SetDefaultToken', Handlers.utils.hasMatchingTag('Action', 'SetDefaultToken'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  ensure(not isEmpty(msg.token), 'Missing token')
  defaultToken = msg.token
  allowedTokens[defaultToken] = true
  enforceAllowlist = true
  emit('DefaultTokenSet', { token = defaultToken })
end)

-- View: GetJob
Handlers.add('GetJob', Handlers.utils.hasMatchingTag('Action', 'GetJob'), function(msg)
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ao.send({ Target = msg.From, Action = 'GetJobResult', JobId = jobId, Data = json.encode(job or {}) })
end)

-- Deposit: Creates a new escrow job with funding but no assigned freelancer yet
-- Status: none → 'funded'
-- Parameters: jobId, client, token, amount, meta (optional)
-- Only the client can call this to fund their own job
Handlers.add('Deposit', Handlers.utils.hasMatchingTag('Action', 'Deposit'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local client = msg.client
  local token = msg.token or defaultToken
  local amount = tostring(msg.amount or '')
  local meta = msg.meta -- optional table/string

  -- Check for job ID conflicts - allow reuse only if previous job is in final state
  local existingJob = jobs[jobId]
  if existingJob then
    local finalStates = { cancelled = true, released = true, refunded = true }
    ensure(finalStates[existingJob.status], 'Job ID already in use by active job')
    -- Note: Reusing job ID will overwrite the previous job record entirely.
    -- Previous job history is not preserved in this implementation.
  end
  
  ensure(not isEmpty(jobId) and not isEmpty(client) and not isEmpty(token), 'Missing required fields: jobId, client, token')
  ensure(isDigits(amount) and cmp(amount, '0') > 0, 'Amount must be positive integer string')
  -- Only the client is allowed to initiate a deposit for their job
  ensure(msg.From == client, 'Only client can deposit for their own job')
  -- Token allowlist
  if enforceAllowlist then ensure(allowedTokens[token] == true, 'Token not allowed') end
  -- Basic limits
  ensure(#jobId <= 128, 'jobId too long')
  
  -- Validate meta size for both string and table types
  if meta ~= nil then
    local metaStr
    if type(meta) == 'string' then
      metaStr = meta
    else
      -- Serialize table to JSON to check size
      local success, result = pcall(json.encode, meta)
      ensure(success, 'Invalid meta: cannot serialize to JSON')
      metaStr = result
    end
    ensure(#metaStr <= 2048, 'meta too long (max 2048 characters when serialized)')
  end

  -- Pull funds from client to this process. Prefer TransferFrom if supported, else require client to pre-transfer.
  -- We optimistically try TransferFrom and fall back if token errors. In AO, failures throw; caller should pre-approve.
  ao.send({
    Target = token,
    Action = 'TransferFrom',
    From = client,
    To = ao.id,
    Quantity = tostring(amount),
    -- Some tokens expect tags: Caller = ao.id or Spender = ao.id
    Spender = ao.id,
  })

  jobs[jobId] = {
    client = client,
    freelancer = nil, -- No freelancer assigned yet
    token = token,
    amount = amount,
    status = 'funded', -- Job is funded but not yet assigned
    createdAt = now(),
    meta = meta,
    dispute = nil,
  }

  emit('Deposited', { 
    jobId = jobId, 
    status = 'funded',
    by = 'client',
    client = client, 
    freelancer = nil, 
    amount = amount,
    token = token 
  })
end)

-- AssignFreelancer: Assigns a freelancer to a funded job
-- Status: 'funded' → 'locked'
-- Parameters: jobId, freelancer
-- Only the client of the job can call this
Handlers.add('AssignFreelancer', Handlers.utils.hasMatchingTag('Action', 'AssignFreelancer'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local freelancer = msg.freelancer
  
  ensure(not isEmpty(jobId), 'Missing jobId')
  ensure(not isEmpty(freelancer), 'Missing freelancer')
  
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'funded', 'Job must be in funded status to assign freelancer')
  ensure(msg.From == job.client, 'Only the client can assign freelancer to their job')
  
  -- Assign the freelancer and lock the job
  job.freelancer = freelancer
  job.status = 'locked'
  job.assignedAt = now()
  
  emit('FreelancerAssigned', { 
    jobId = jobId, 
    status = 'locked',
    by = 'client',
    client = job.client,
    freelancer = freelancer, 
    amount = job.amount 
  })
end)

-- CancelUnassigned: Allows client to cancel and refund a funded job before assigning freelancer
-- Status: 'funded' → 'cancelled' (final state)
-- Only the client can call this and only for unassigned jobs
Handlers.add('CancelUnassigned', Handlers.utils.hasMatchingTag('Action', 'CancelUnassigned'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  
  ensure(not isEmpty(jobId), 'Missing jobId')
  
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'funded', 'Job must be in funded status to cancel')
  ensure(job.freelancer == nil, 'Cannot cancel job with assigned freelancer')
  ensure(msg.From == job.client, 'Only the client can cancel their job')
  
  -- Refund the client directly
  local success, err = pcall(function()
    transfer(job.token, job.client, job.amount)
  end)
  
  if not success then
    error('Transfer failed: ' .. tostring(err))
  end
  
  job.status = 'cancelled'
  job.cancelledAt = now()
  
  emit('JobCancelled', { 
    jobId = jobId, 
    status = 'cancelled',
    by = 'client',
    client = job.client, 
    freelancer = job.freelancer, 
    amount = job.amount 
  })
end)

local function ensureCallerIsClient(job, caller)
  ensure(caller == job.client, 'Only client can perform this action')
end

local function transfer(token, to, qty)
  ao.send({ Target = token, Action = 'Transfer', To = to, Quantity = tostring(qty) })
end

-- Release: Releases escrowed funds to the freelancer with optional platform fee
-- Status: 'locked' → 'released' (final state)
-- Only the client can call this
Handlers.add('Release', Handlers.utils.hasMatchingTag('Action', 'Release'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job must be locked to release funds')
  ensure(msg.From == job.client, 'Only client can release funds')

  -- in-flight state prevents re-entrancy/double spend
  job.status = 'releasing'
  local amount = job.amount
  local fee = '0'
  if platformFeeBps and platformFeeBps > 0 and platformTreasury then
    fee = bps(amount, platformFeeBps)
  end
  ensure(cmp(amount, fee) >= 0, 'Fee exceeds amount')
  local payout = sub(amount, fee)

  if cmp(fee, '0') > 0 then transfer(job.token, platformTreasury, fee) end
  if cmp(payout, '0') > 0 then transfer(job.token, job.freelancer, payout) end

  job.status = 'released'
  job.releasedAt = now()
  emit('Released', { 
    jobId = jobId, 
    status = 'released',
    by = 'client',
    client = job.client,
    freelancer = job.freelancer,
    amount = amount, 
    fee = fee, 
    payout = payout 
  })
end)

-- Refund: Returns escrowed funds to the client
-- Status: 'locked' → 'refunded' (final state)
-- Only the client can call this
Handlers.add('Refund', Handlers.utils.hasMatchingTag('Action', 'Refund'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job must be locked to refund')
  ensure(msg.From == job.client, 'Only client can refund their job')

  job.status = 'refunding'
  transfer(job.token, job.client, job.amount)
  job.status = 'refunded'
  job.refundedAt = now()
  emit('Refunded', { 
    jobId = jobId, 
    status = 'refunded',
    by = 'client',
    client = job.client,
    freelancer = job.freelancer,
    amount = job.amount 
  })
end)

-- OpenDispute: Allows client or freelancer to open a dispute on a locked job
-- Only works on jobs in 'locked' status (with assigned freelancer)
Handlers.add('OpenDispute', Handlers.utils.hasMatchingTag('Action', 'OpenDispute'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local caller = msg.From
  local reason = msg.reason
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Cannot dispute job that is not locked')
  ensure(caller == job.client or caller == job.freelancer, 'Only job parties can open dispute')
  ensure(job.freelancer ~= nil, 'Cannot dispute job without assigned freelancer')
  if type(reason) == 'string' then ensure(#reason <= 1024, 'reason too long') end
  job.dispute = { openedBy = caller, reason = reason, openedAt = now() }
  emit('DisputeOpened', { 
    jobId = jobId, 
    status = job.status, -- remains 'locked'
    by = (caller == job.client) and 'client' or 'freelancer',
    client = job.client,
    freelancer = job.freelancer,
    amount = job.amount,
    reason = reason 
  })
end)

-- DecideDispute: Allows arbiter to resolve disputes by releasing or refunding
-- Can transition 'locked' → 'released' or 'locked' → 'refunded'
Handlers.add('DecideDispute', Handlers.utils.hasMatchingTag('Action', 'DecideDispute'), function(msg)
  ensure(not Paused, 'Paused')
  ensure(arbiter ~= nil, 'No arbiter configured')
  ensure(msg.From == arbiter, 'Only arbiter can decide disputes')
  local jobId = tostring(msg.jobId)
  local outcome = msg.outcome -- 'release' or 'refund'
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job must be locked to decide dispute')
  ensure(job.dispute ~= nil, 'No dispute open for this job')

  if outcome == 'release' then
    -- Reuse Release logic without client restriction
    job.status = 'releasing'
    local amount = job.amount
    local fee = '0'
    if platformFeeBps and platformFeeBps > 0 and platformTreasury then
      fee = bps(amount, platformFeeBps)
    end
    ensure(cmp(amount, fee) >= 0, 'Fee exceeds amount')
    local payout = sub(amount, fee)
    if cmp(fee, '0') > 0 then transfer(job.token, platformTreasury, fee) end
    if cmp(payout, '0') > 0 then transfer(job.token, job.freelancer, payout) end

    job.status = 'released'
    job.releasedAt = now()
    job.dispute = nil -- Clear dispute since job is finalized
    emit('Released', { 
      jobId = jobId, 
      status = 'released',
      by = 'arbiter',
      client = job.client,
      freelancer = job.freelancer,
      amount = amount, 
      fee = fee, 
      payout = payout 
    })
  elseif outcome == 'refund' then
    job.status = 'refunding'
    transfer(job.token, job.client, job.amount)
    job.status = 'refunded'
    job.refundedAt = now()
    job.dispute = nil -- Clear dispute since job is finalized
    emit('Refunded', { 
      jobId = jobId, 
      status = 'refunded',
      by = 'arbiter',
      client = job.client,
      freelancer = job.freelancer,
      amount = job.amount 
    })
  else
    error('Invalid outcome: must be "release" or "refund"')
  end
end)

-- ClaimTimeout: Allows freelancer to claim payment after client inactivity timeout
-- Only works on jobs in 'locked' status after timeout period has passed
-- Timeout is calculated from when freelancer was assigned, not when job was created
Handlers.add('ClaimTimeout', Handlers.utils.hasMatchingTag('Action', 'ClaimTimeout'), function(msg)
  ensure(not Paused, 'Paused')
  ensure(timeoutSecs and timeoutSecs > 0, 'Timeouts disabled')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job must be locked to claim timeout')
  ensure(job.freelancer ~= nil, 'Job must have assigned freelancer to claim timeout')
  ensure(job.assignedAt ~= nil, 'Job missing assignment timestamp')
  ensure((now() - job.assignedAt) >= timeoutSecs, 'Timeout period not yet reached since freelancer assignment')

  job.status = 'releasing'
  local amount = job.amount
  local fee = '0'
  if platformFeeBps and platformFeeBps > 0 and platformTreasury then
    fee = bps(amount, platformFeeBps)
  end
  ensure(cmp(amount, fee) >= 0, 'Fee exceeds amount')
  local payout = sub(amount, fee)
  if cmp(fee, '0') > 0 then transfer(job.token, platformTreasury, fee) end
  if cmp(payout, '0') > 0 then transfer(job.token, job.freelancer, payout) end

  job.status = 'released'
  job.releasedAt = now()
  emit('Released', { 
    jobId = jobId, 
    status = 'released',
    by = 'timeout',
    client = job.client,
    freelancer = job.freelancer,
    amount = amount, 
    fee = fee, 
    payout = payout 
  })
end)

-- AdminResetJob: Emergency function to reset jobs stuck in transition states
-- Resets 'releasing' or 'refunding' status back to 'locked' (no token transfers)
Handlers.add('AdminResetJob', Handlers.utils.hasMatchingTag('Action', 'AdminResetJob'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized: only owner can reset jobs')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'releasing' or job.status == 'refunding', 'Job not in transition state')
  job.status = 'locked'
  emit('JobReset', { jobId = jobId })
end)

-- TransferOwnership: Allows current owner to transfer ownership to a new address
Handlers.add('TransferOwnership', Handlers.utils.hasMatchingTag('Action', 'TransferOwnership'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized: only current owner can transfer ownership')
  ensure(not isEmpty(msg.newOwner), 'Missing newOwner address')
  Owner = msg.newOwner
  emit('OwnerSet', { owner = Owner })
end)

-- View handlers: GetConfig, ListAllowedTokens, ListJobs
-- These provide read-only access to contract state

-- GetConfig: Returns current contract configuration
Handlers.add('GetConfig', Handlers.utils.hasMatchingTag('Action', 'GetConfig'), function(msg)
  local cfg = { Owner = Owner, Paused = Paused, platformFeeBps = platformFeeBps, platformTreasury = platformTreasury, arbiter = arbiter, timeoutSecs = timeoutSecs }
  ao.send({ Target = msg.From, Action = 'GetConfigResult', Data = json.encode(cfg) })
end)

-- ListAllowedTokens: Returns list of allowed token addresses
Handlers.add('ListAllowedTokens', Handlers.utils.hasMatchingTag('Action', 'ListAllowedTokens'), function(msg)
  local list = {}
  for t, v in pairs(allowedTokens) do
    if v then table.insert(list, t) end
  end
  ao.send({ Target = msg.From, Action = 'ListAllowedTokensResult', Data = json.encode(list) })
end)

-- ListJobs: Returns paginated list of jobs with basic information
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
