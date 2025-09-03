import { loadConfig, send } from './utils.js'

async function main() {
  const cfg = loadConfig()
  const action = process.argv[2]
  if (!cfg.ESCROW_PROCESS_ID) throw new Error('Missing ESCROW_PROCESS_ID')
  switch (action) {
    case 'init-owner':
      await send(cfg.ESCROW_PROCESS_ID, [{ name: 'Action', value: 'InitOwner' }])
      break
    case 'pause':
      await send(cfg.ESCROW_PROCESS_ID, [{ name: 'Action', value: 'Pause' }])
      break
    case 'unpause':
      await send(cfg.ESCROW_PROCESS_ID, [{ name: 'Action', value: 'Unpause' }])
      break
    case 'allow-token': {
      const token = process.env.TOKEN
      if (!token) throw new Error('Provide TOKEN env var')
      await send(cfg.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'AllowToken' },
        { name: 'token', value: token },
      ])
      break
    }
    case 'disallow-token': {
      const token = process.env.TOKEN
      if (!token) throw new Error('Provide TOKEN env var')
      await send(cfg.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'DisallowToken' },
        { name: 'token', value: token },
      ])
      break
    }
    case 'transfer-owner': {
      const newOwner = process.env.NEW_OWNER
      if (!newOwner) throw new Error('Provide NEW_OWNER env var')
      await send(cfg.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'TransferOwnership' },
        { name: 'newOwner', value: newOwner },
      ])
      break
    }
    case 'set-default-token': {
      const token = process.env.TOKEN
      if (!token) throw new Error('Provide TOKEN env var')
      await send(cfg.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'SetDefaultToken' },
        { name: 'token', value: token },
      ])
      break
    }
    case 'reset-job': {
      const jobId = process.env.JOB_ID
      if (!jobId) throw new Error('Provide JOB_ID env var')
      await send(cfg.ESCROW_PROCESS_ID, [
        { name: 'Action', value: 'AdminResetJob' },
        { name: 'jobId', value: jobId },
      ])
      break
    }
    default:
      throw new Error('Usage: node admin.js [init-owner|pause|unpause|allow-token|disallow-token|transfer-owner|reset-job]')
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
