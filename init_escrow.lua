-- Robust Escrow Initialization Script
print("=== INITIALIZING ESCROW CONTRACT ===")

-- Test JSON library availability
local json_available = false
local status, result = pcall(function() return require('json') end)
if status then
    json = result
    json_available = true
    print("✓ JSON library is available")
else
    print("⚠ JSON library not available - will use manual output")
end

-- Initialize escrow state properly
print("\n=== Setting up Escrow State ===")

-- Jobs structure: jobId => { client, freelancer, token, amount, status, createdAt, meta, dispute }
if not jobs then
    jobs = {}
    print("✓ Jobs storage initialized")
else
    print("✓ Jobs storage already exists")
end

-- Platform configuration
platformFeeBps = platformFeeBps or 100  -- 1% default fee
platformTreasury = 'GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU'
Owner = Owner or ao.id
Paused = Paused or false

-- Token allowlist
if not allowedTokens then
    allowedTokens = {}
    print("✓ Token allowlist initialized")
else
    print("✓ Token allowlist already exists")
end

-- Whitelist the DAT token
DAT_TOKEN = 'Ve4nk2QjJK9UGNmV_edrsfhFtDq9FkS8TcOkJ0zKN9I'
allowedTokens[DAT_TOKEN] = true

print("\n=== Configuration Summary ===")
print("Process ID: " .. ao.id)
print("Owner: " .. Owner)
print("Treasury: " .. platformTreasury)
print("Platform Fee: " .. platformFeeBps .. " basis points (" .. (platformFeeBps/100) .. "%)")
print("Paused: " .. tostring(Paused))

print("\nAllowed Tokens:")
if allowedTokens then
    local count = 0
    for token, allowed in pairs(allowedTokens) do
        if allowed then
            print("  ✓ " .. token)
            count = count + 1
        end
    end
    if count == 0 then
        print("  (none)")
    end
else
    print("  (none)")
end

print("\nJobs:")
if jobs then
    local count = 0
    for jobId, job in pairs(jobs) do
        count = count + 1
        print("  Job " .. jobId .. ": " .. (job.status or "unknown"))
    end
    if count == 0 then
        print("  (none)")
    end
else
    print("  (none)")
end

print("\n=== Escrow Contract Ready! ===")
print("You can now:")
print("1. Send AllowToken actions to whitelist additional tokens")
print("2. Use Deposit action to create jobs")
print("3. Use AssignFreelancer to assign work")
print("4. Use Release to complete jobs")

-- Helper function to show current state
function showState()
    print("\n=== Current Escrow State ===")
    print("Jobs count: " .. (jobs and #jobs or 0))
    print("Allowed tokens count: " .. (allowedTokens and #allowedTokens or 0))
    print("Treasury: " .. (platformTreasury or "not set"))
    print("Fee: " .. (platformFeeBps or 0) .. " bps")
end
