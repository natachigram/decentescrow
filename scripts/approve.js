import { loadConfig, send } from './utils.js'

async function main() {
  const cfg = loadConfig()
  const qty = process.env.QTY || '0'
  if (!cfg.TOKEN_PROCESS_ID || !cfg.ESCROW_PROCESS_ID) throw new Error('Missing TOKEN_PROCESS_ID or ESCROW_PROCESS_ID in config')
  if (!qty || qty === '0') throw new Error('Provide QTY env for approval (as smallest unit)')

  await send(cfg.TOKEN_PROCESS_ID, [
    { name: 'Action', value: 'Approve' },
    { name: 'Spender', value: cfg.ESCROW_PROCESS_ID },
    { name: 'Quantity', value: String(qty) }
  ])
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
