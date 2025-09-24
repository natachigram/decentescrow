-- Fresh unit tests for ao/escrow.lua using new mock runtime
package.path = './tests/?.lua;./?.lua;' .. package.path
require('tests/mock_runtime')

-- Load the contract
dofile('ao/escrow.lua')

local function reset()
  ao.emitted = {}
  ao.sent = {}
  ao.clearFailRules()
end

local function assertEq(a,b,msg)
  if a ~= b then error((msg or 'assertEq failed') .. string.format(' (%s ~= %s)', tostring(a), tostring(b))) end
end
local function assertTrue(v,msg) if not v then error(msg or 'assertTrue failed') end end
local function assertFalse(v,msg) if v then error(msg or 'assertFalse failed') end end

-- Initialize owner and config
Handlers._handlers['InitOwner'].fn({ From='OWNER_ADDRESS_12345', Action='InitOwner' })
Handlers._handlers['SetConfig'].fn({ From='OWNER_ADDRESS_12345', Action='SetConfig', platformFeeBps=100, platformTreasury='TREASURY_ADDR_98765', arbiter='ARBITER_ADDR_45678' })

-- Deposit and assign freelancer
reset()
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-1', amount='10000' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT_ADDR_00001', Action='AssignFreelancer', jobId='job-1', freelancer='FREE_ADDR_00002' })

-- Release flow (client)
reset()
Handlers._handlers['Release'].fn({ From='CLIENT_ADDR_00001', Action='Release', jobId='job-1' })
-- Claim treasury fee and freelancer payout (pull model)
local ok1 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='TREASURY_ADDR_98765', Action='Claim', token='AR', amount='100' })
end)
assertTrue(ok1, 'Treasury claim should succeed')
local ok2 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE_ADDR_00002', Action='Claim', token='AR', amount='9900' })
end)
assertTrue(ok2, 'Freelancer claim should succeed')

-- Cancel unassigned funded job
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-2', amount='500' })
reset()
Handlers._handlers['CancelUnassigned'].fn({ From='CLIENT_ADDR_00001', Action='CancelUnassigned', jobId='job-2' })
local ok3 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='CLIENT_ADDR_00001', Action='Claim', token='AR', amount='500' })
end)
assertTrue(ok3, 'Client refund claim should succeed')

-- Mutual cancel on locked job
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-3', amount='1000' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT_ADDR_00001', Action='AssignFreelancer', jobId='job-3', freelancer='FREE_ADDR_00002' })
reset()
Handlers._handlers['RequestCancel'].fn({ From='CLIENT_ADDR_00001', Action='RequestCancel', jobId='job-3' })
Handlers._handlers['ApproveCancel'].fn({ From='FREE_ADDR_00002', Action='ApproveCancel', jobId='job-3' })
local ok4 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='CLIENT_ADDR_00001', Action='Claim', token='AR', amount='1000' })
end)
assertTrue(ok4, 'Client mutual-cancel refund claim should succeed')

-- Dispute path: refund
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-4', amount='700' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT_ADDR_00001', Action='AssignFreelancer', jobId='job-4', freelancer='FREE_ADDR_00002' })
Handlers._handlers['OpenDispute'].fn({ From='CLIENT_ADDR_00001', Action='OpenDispute', jobId='job-4', reason='scope change' })
reset()
Handlers._handlers['DecideDispute'].fn({ From='ARBITER_ADDR_45678', Action='DecideDispute', jobId='job-4', outcome='refund' })
local ok5 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='CLIENT_ADDR_00001', Action='Claim', token='AR', amount='700' })
end)
assertTrue(ok5, 'Client dispute refund claim should succeed')

-- Dispute path: release
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-5', amount='1000' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT_ADDR_00001', Action='AssignFreelancer', jobId='job-5', freelancer='FREE_ADDR_00002' })
Handlers._handlers['OpenDispute'].fn({ From='FREE_ADDR_00002', Action='OpenDispute', jobId='job-5', reason='work accepted' })
reset()
Handlers._handlers['DecideDispute'].fn({ From='ARBITER_ADDR_45678', Action='DecideDispute', jobId='job-5', outcome='release' })
-- fee = 1% of 1000 => 10, payout 990
local ok6 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='TREASURY_ADDR_98765', Action='Claim', token='AR', amount='10' })
end)
assertTrue(ok6, 'Treasury dispute fee claim should succeed')
local ok7 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE_ADDR_00002', Action='Claim', token='AR', amount='990' })
end)
assertTrue(ok7, 'Freelancer dispute payout claim should succeed')

-- Claim failure should emit TransferFailed and restore pending
Handlers._handlers['Deposit'].fn({ From='CLIENT_ADDR_00001', Action='Deposit', jobId='job-6', amount='3' })
Handlers._handlers['AssignFreelancer'].fn({ From='CLIENT_ADDR_00001', Action='AssignFreelancer', jobId='job-6', freelancer='FREE_ADDR_00002' })
Handlers._handlers['Release'].fn({ From='CLIENT_ADDR_00001', Action='Release', jobId='job-6' })
reset()
ao.addFailRule(function(msg) return msg.Action=='Transfer' and msg.To=='FREE_ADDR_00002' and msg.Quantity=='3' end)
local ok8 = pcall(function()
  Handlers._handlers['Claim'].fn({ From='FREE_ADDR_00002', Action='Claim', token='AR', amount='3' })
end)
assertTrue(ok8, 'Claim should not throw on send failure')
local foundTF = false
for _, e in ipairs(ao.emitted) do if e.event == 'TransferFailed' then foundTF = true break end end
assertTrue(foundTF, 'Expected TransferFailed event')

print('ALL TESTS PASSED (fresh)')

