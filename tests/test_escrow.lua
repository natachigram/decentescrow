-- Unit tests for ao/escrow.lua using mock runtime
package.path = './tests/?.lua;./?.lua;' .. package.path
require('tests/mock_runtime')

-- Load the contract
dofile('ao/escrow.lua')

local function reset()
  ao.emitted = {}
  ao.sent = {}
  ao.clearFailRules()
end

local function lastEvent()
  return ao.emitted[#ao.emitted]
end

local function assertEqual(a,b,msg)
  if a ~= b then error((msg or 'assertEqual failed') .. string.format(' (%s ~= %s)', tostring(a), tostring(b))) end
end
local function assertTrue(v,msg) if not v then error(msg or 'assertTrue failed') end end
local function assertFalse(v,msg) if v then error(msg or 'assertFalse failed') end end

-- Admin setup
Handlers._handlers['InitOwner'].fn({ From = 'OWNER', Action='InitOwner' })
Handlers._handlers['AllowToken'].fn({ From = 'OWNER', Action='AllowToken', token='TOKEN' })
Handlers._handlers['SetDefaultToken'].fn({ From = 'OWNER', Action='SetDefaultToken', token='TOKEN' })

-- Client deposits
reset()
Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-1', client='CLIENT', freelancer='FREE', amount='1000' })
assertEqual(lastEvent().event, 'Deposited', 'Deposit event')
assertEqual(#ao.sent > 0, true, 'TransferFrom sent')
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT', Action='AssignFreelancer', jobId='job-1', freelancer='FREE' })

-- Client releases
reset()
Handlers._handlers['Release'].fn({ From='CLIENT', Action='Release', jobId='job-1' })
assertEqual(lastEvent().event, 'Released', 'Release event')
-- Pull model: ensure pending balances were credited
-- Claim freelancer payout
local claimOk = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE', Action='Claim', token='TOKEN' })
end)
assertTrue(claimOk, 'Claim should succeed')
-- And claim nothing more
local claimNo = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE', Action='Claim', token='TOKEN' })
end)
assertFalse(claimNo, 'No more pending to claim')

-- New deposit and refund
Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-2', client='CLIENT', freelancer='FREE', amount='500' })
reset()
-- Use CancelUnassigned because no freelancer assigned yet
Handlers._handlers['CancelUnassigned'].fn({ From='CLIENT', Action='CancelUnassigned', jobId='job-2' })
assertEqual(lastEvent().event, 'JobCancelled', 'CancelUnassigned event')
-- Client should be able to claim refund credited to pending
local cr = pcall(function()
  Handlers._handlers['Claim'].fn({ From='CLIENT', Action='Claim', token='TOKEN', amount='500' })
end)
assertTrue(cr, 'Client refund claim should succeed')

-- Paused prevents deposit
Handlers._handlers['Pause'].fn({ From='OWNER', Action='Pause' })
local ok = pcall(function()
  Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-3', client='CLIENT', freelancer='FREE', amount='1' })
end)
assertFalse(ok, 'Deposit should fail when paused')
Handlers._handlers['Unpause'].fn({ From='OWNER', Action='Unpause' })

-- Allowlist enforced (disallow then try explicit token)
Handlers._handlers['DisallowToken'].fn({ From='OWNER', Action='DisallowToken', token='TOKEN' })
local ok2 = pcall(function()
  Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-4', client='CLIENT', freelancer='FREE', token='TOKEN', amount='1' })
end)
assertFalse(ok2, 'Deposit should fail for disallowed token')
Handlers._handlers['AllowToken'].fn({ From='OWNER', Action='AllowToken', token='TOKEN' })

-- Default token path (omit token), and fee distribution check
Handlers._handlers['SetConfig'].fn({ From='OWNER', Action='SetConfig', platformFeeBps=100, platformTreasury='TREASURY', timeoutSecs=0 }) -- 1% fee
reset()
Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-5', client='CLIENT', freelancer='FREE', amount='10000' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT', Action='AssignFreelancer', jobId='job-5', freelancer='FREE' })
reset()
Handlers._handlers['Release'].fn({ From='CLIENT', Action='Release', jobId='job-5' })
assertEqual(lastEvent().event, 'Released', 'Release event for job-5')
-- Pull model: perform claims and verify sends
local tclaim = pcall(function()
  Handlers._handlers['Claim'].fn({ From='TREASURY', Action='Claim', token='TOKEN', amount='100' })
end)
assertTrue(tclaim, 'Treasury claim should succeed')
local fclaim = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE', Action='Claim', token='TOKEN', amount='9900' })
end)
assertTrue(fclaim, 'Freelancer claim should succeed')
local treasXfer, payXfer = false, false
for _,m in ipairs(ao.sent) do
  if m.Target == 'TOKEN' and m.Action == 'Transfer' and m.To == 'TREASURY' and m.Quantity == '100' then treasXfer = true end
  if m.Target == 'TOKEN' and m.Action == 'Transfer' and m.To == 'FREE' and m.Quantity == '9900' then payXfer = true end
end
assertTrue(treasXfer, 'Treasury transfer missing or wrong')
assertTrue(payXfer, 'Payout transfer missing or wrong')

-- Auth: non-client cannot release/refund
Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-6', client='CLIENT', freelancer='FREE', amount='10' })
local ok3 = pcall(function()
  Handlers._handlers['Release'].fn({ From='NOTCLIENT', Action='Release', jobId='job-6' })
end)
assertFalse(ok3, 'Non-client release should fail')
local ok4 = pcall(function()
  Handlers._handlers['Refund'].fn({ From='NOTCLIENT', Action='Refund', jobId='job-6' })
end)
assertFalse(ok4, 'Non-client refund should fail')

-- Dispute refund by arbiter
Handlers._handlers['SetConfig'].fn({ From='OWNER', Action='SetConfig', arbiter='ARBITER' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT', Action='AssignFreelancer', jobId='job-6', freelancer='FREE' })
Handlers._handlers['OpenDispute'].fn({ From='CLIENT', Action='OpenDispute', jobId='job-6', reason='x' })
reset()
Handlers._handlers['DecideDispute'].fn({ From='ARBITER', Action='DecideDispute', jobId='job-6', outcome='refund' })
assertEqual(lastEvent().event, 'Refunded', 'Arbiter refunded')
-- Client should claim dispute refund
local cr2 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='CLIENT', Action='Claim', token='TOKEN' })
end)
assertTrue(cr2, 'Client claim should succeed')

-- Simulate token transfer failure during claim
Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId='job-7', client='CLIENT', freelancer='FREE', amount='3' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT', Action='AssignFreelancer', jobId='job-7', freelancer='FREE' })
reset()
Handlers._handlers['Release'].fn({ From='CLIENT', Action='Release', jobId='job-7' })
-- setup fail rule for FREE transfer
ao.addFailRule(function(msg)
  return msg.Action == 'Transfer' and msg.To == 'FREE' and msg.Quantity == '3'
end)
local okFail = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE', Action='Claim', token='TOKEN', amount='3' })
end)
assertTrue(okFail, 'Claim handler should not throw on send failure')
-- Ensure a TransferFailed event was emitted
local foundTF = false
for _,e in ipairs(ao.emitted) do
  if e.event == 'TransferFailed' then foundTF = true break end
end
assertTrue(foundTF, 'Expected TransferFailed event on simulated failure')

-- ListJobs pagination with many jobs
for i=1,120 do
  local jid = 'job-list-'..i
  Handlers._handlers['Deposit'].fn({ From='CLIENT', Action='Deposit', jobId=jid, client='CLIENT', amount='1' })
end
reset()
Handlers._handlers['ListJobs'].fn({ From='ANY', Action='ListJobs', limit=50 })
-- Verify a ListJobsResult message was sent with Data
local foundList = false
for _,m in ipairs(ao.sent) do
  if m.Action == 'ListJobsResult' and m.Data ~= nil then foundList = true break end
end
assertTrue(foundList, 'ListJobs should respond with result message')

print('ALL TESTS PASSED')

print('ALL TESTS PASSED')
