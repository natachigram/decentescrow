-- AO Escrow Process (Lua-like for AO)
-- Features: deposit, release, refund, optional fee, arbiter, timeout, metadata
-- Assumes a fungible AO token process that supports `Transfer` messages and optionally `Approve`/`TransferFrom` patterns.
-- Author: GitHub Copilot

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

-- Deposit: deposit(jobId, client, freelancer, token, amount, meta?)
Handlers.add('Deposit', Handlers.utils.hasMatchingTag('Action', 'Deposit'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local client = msg.client
  local freelancer = msg.freelancer
  local token = msg.token or defaultToken
  local amount = tostring(msg.amount or '')
  local meta = msg.meta -- optional table/string

  ensure(not jobs[jobId], 'Job already funded')
  ensure(not isEmpty(jobId) and not isEmpty(client) and not isEmpty(freelancer) and not isEmpty(token), 'Missing fields')
  ensure(isDigits(amount) and cmp(amount, '0') > 0, 'Amount must be positive integer string')
  -- Only the client is allowed to initiate a deposit for their job
  ensure(msg.From == client, 'Only client can deposit')
  -- Token allowlist
  if enforceAllowlist then ensure(allowedTokens[token] == true, 'Token not allowed') end
  -- Basic limits
  ensure(#jobId <= 128, 'jobId too long')
  if type(meta) == 'string' then ensure(#meta <= 2048, 'meta too long') end

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
    freelancer = freelancer,
    token = token,
  amount = amount,
    status = 'locked',
  createdAt = now(),
    meta = meta,
    dispute = nil,
  }

  emit('Deposited', { jobId = jobId, client = client, freelancer = freelancer, token = token, amount = amount })
end)

local function ensureCallerIsClient(job, caller)
  ensure(caller == job.client, 'Only client can perform this action')
end

local function transfer(token, to, qty)
  ao.send({ Target = token, Action = 'Transfer', To = to, Quantity = tostring(qty) })
end

-- Release: release(jobId) — only client From can call
Handlers.add('Release', Handlers.utils.hasMatchingTag('Action', 'Release'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job not locked')
  ensure(msg.From == job.client, 'Only client can perform this action')

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
  emit('Released', { jobId = jobId, amount = amount, fee = fee, payout = payout })
end)

-- Refund: refund(jobId) — only client From can call
Handlers.add('Refund', Handlers.utils.hasMatchingTag('Action', 'Refund'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job not locked')
  ensure(msg.From == job.client, 'Only client can perform this action')

  job.status = 'refunding'
  transfer(job.token, job.client, job.amount)
  job.status = 'refunded'
  job.refundedAt = now()
  emit('Refunded', { jobId = jobId, amount = job.amount })
end)

-- Dispute: optional - open and decide
Handlers.add('OpenDispute', Handlers.utils.hasMatchingTag('Action', 'OpenDispute'), function(msg)
  ensure(not Paused, 'Paused')
  local jobId = tostring(msg.jobId)
  local caller = msg.From
  local reason = msg.reason
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Cannot dispute non-locked job')
  ensure(caller == job.client or caller == job.freelancer, 'Only job parties can open dispute')
  if type(reason) == 'string' then ensure(#reason <= 1024, 'reason too long') end
  job.dispute = { openedBy = caller, reason = reason, openedAt = now() }
  emit('DisputeOpened', { jobId = jobId, by = caller, reason = reason })
end)

Handlers.add('DecideDispute', Handlers.utils.hasMatchingTag('Action', 'DecideDispute'), function(msg)
  ensure(not Paused, 'Paused')
  ensure(arbiter ~= nil, 'No arbiter configured')
  ensure(msg.From == arbiter, 'Only arbiter can decide')
  local jobId = tostring(msg.jobId)
  local outcome = msg.outcome -- 'release' or 'refund'
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job not locked')
  ensure(job.dispute ~= nil, 'No dispute open')

  if outcome == 'release' then
    -- Reuse Release logic without client restriction
    job.status = 'releasing'
    local amount = job.amount
    local fee = '0'
    if platformFeeBps and platformFeeBps > 0 and platformTreasury then
      fee = bps(amount, platformFeeBps)
    end
    local payout = sub(amount, fee)
    if cmp(fee, '0') > 0 then transfer(job.token, platformTreasury, fee) end
    if cmp(payout, '0') > 0 then transfer(job.token, job.freelancer, payout) end

    job.status = 'released'
    job.releasedAt = now()
    emit('Released', { jobId = jobId, amount = amount, fee = fee, payout = payout, by = 'arbiter' })
  elseif outcome == 'refund' then
    job.status = 'refunding'
    transfer(job.token, job.client, job.amount)
    job.status = 'refunded'
    job.refundedAt = now()
    emit('Refunded', { jobId = jobId, amount = job.amount, by = 'arbiter' })
  else
    error('Invalid outcome')
  end
end)

-- Timeout: freelancer can claim if client inactive and timeout passed
Handlers.add('ClaimTimeout', Handlers.utils.hasMatchingTag('Action', 'ClaimTimeout'), function(msg)
  ensure(not Paused, 'Paused')
  ensure(timeoutSecs and timeoutSecs > 0, 'Timeouts disabled')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'locked', 'Job not locked')
  ensure((now() - job.createdAt) >= timeoutSecs, 'Timeout not reached')

  job.status = 'releasing'
  local amount = job.amount
  local fee = '0'
  if platformFeeBps and platformFeeBps > 0 and platformTreasury then
    fee = bps(amount, platformFeeBps)
  end
  local payout = sub(amount, fee)
  if cmp(fee, '0') > 0 then transfer(job.token, platformTreasury, fee) end
  if cmp(payout, '0') > 0 then transfer(job.token, job.freelancer, payout) end

  job.status = 'released'
  job.releasedAt = now()
  emit('Released', { jobId = jobId, amount = amount, fee = fee, payout = payout, by = 'timeout' })
end)

-- Admin: reset a job stuck in in-flight state back to locked (no token transfers)
Handlers.add('AdminResetJob', Handlers.utils.hasMatchingTag('Action', 'AdminResetJob'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  local jobId = tostring(msg.jobId)
  local job = jobs[jobId]
  ensure(job ~= nil, 'Job not found')
  ensure(job.status == 'releasing' or job.status == 'refunding', 'Job not in in-flight state')
  job.status = 'locked'
  emit('JobReset', { jobId = jobId })
end)

-- Admin: transfer ownership
Handlers.add('TransferOwnership', Handlers.utils.hasMatchingTag('Action', 'TransferOwnership'), function(msg)
  ensure(Owner ~= nil and msg.From == Owner, 'Unauthorized')
  ensure(not isEmpty(msg.newOwner), 'Missing newOwner')
  Owner = msg.newOwner
  emit('OwnerSet', { owner = Owner })
end)

-- Views
Handlers.add('GetConfig', Handlers.utils.hasMatchingTag('Action', 'GetConfig'), function(msg)
  local cfg = { Owner = Owner, Paused = Paused, platformFeeBps = platformFeeBps, platformTreasury = platformTreasury, arbiter = arbiter, timeoutSecs = timeoutSecs }
  ao.send({ Target = msg.From, Action = 'GetConfigResult', Data = json.encode(cfg) })
end)

Handlers.add('ListAllowedTokens', Handlers.utils.hasMatchingTag('Action', 'ListAllowedTokens'), function(msg)
  local list = {}
  for t, v in pairs(allowedTokens) do
    if v then table.insert(list, t) end
  end
  ao.send({ Target = msg.From, Action = 'ListAllowedTokensResult', Data = json.encode(list) })
end)

-- List jobs (basic pagination)
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
