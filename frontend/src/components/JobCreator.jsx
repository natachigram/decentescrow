import React, { useState } from 'react'
import { useEscrow } from './utils/escrow.js'
import './JobCreator.css'

const JobCreator = ({ onJobCreated }) => {
  const { deposit } = useEscrow()
  const [jobId, setJobId] = useState('')
  const [amount, setAmount] = useState('')
  const [meta, setMeta] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleDeposit = async () => {
    if (!jobId || !amount) {
      setMessage('Please enter Job ID and amount')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      const metaObj = meta ? JSON.parse(meta) : {}
      await deposit(jobId, amount, metaObj)
      
      setMessage(`✅ Escrow created! Job ${jobId} with ${amount} tAR`)
      setJobId('')
      setAmount('')
      setMeta('')
      
      if (onJobCreated) {
        setTimeout(onJobCreated, 4000) // Wait for deposit to process
      }
    } catch (error) {
      setMessage(`❌ Deposit failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="job-creator card">
      <h3>🛠 Create Escrow Job</h3>
      <div className="form-group">
        <label>Job ID:</label>
        <input 
          type="text" 
          value={jobId} 
          onChange={(e) => setJobId(e.target.value)}
          placeholder="project-deliverable-001"
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label>Escrow Amount (tAR):</label>
        <input 
          type="number" 
          value={amount} 
          onChange={(e) => setAmount(e.target.value)}
          placeholder="1000"
          disabled={loading}
        />
      </div>
      <div className="form-group">
        <label>Metadata (JSON optional):</label>
        <textarea 
          value={meta} 
          onChange={(e) => setMeta(e.target.value)}
          placeholder='{"description": "Website development", "deadline": "2024-12-31"}'
          rows={3}
          disabled={loading}
        />
      </div>
      <button 
        onClick={handleDeposit} 
        disabled={loading || !jobId || !amount}
        className="deposit-btn"
      >
        {loading ? '⏳ Creating Escrow...' : '🔒 Create Escrow'}
      </button>
      {message && <div className="message">{message}</div>}
    </div>
  )
}

export default JobCreator