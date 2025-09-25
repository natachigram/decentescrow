import React, { useState } from 'react'
import { useEscrow } from './utils/escrow.js'
import './JobManager.css'

const JobManager = ({ role, onUpdate }) => {
  const { 
    assignFreelancer, 
    release, 
    requestCancel, 
    approveCancel, 
    openDispute,
    claim 
  } = useEscrow()
  
  const [jobId, setJobId] = useState('')
  const [freelancerAddress, setFreelancerAddress] = useState('')
  const [disputeReason, setDisputeReason] = useState('')
  const [claimAmount, setClaimAmount] = useState('')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  const handleAction = async (action, ...args) => {
    if (!jobId) {
      setMessage('Please enter a Job ID')
      return
    }

    setLoading(true)
    setMessage('')

    try {
      await action(jobId, ...args)
      setMessage(`✅ Action completed for job ${jobId}`)
      setJobId('')
      setFreelancerAddress('')
      setDisputeReason('')
      
      if (onUpdate) {
        setTimeout(onUpdate, 3000)
      }
    } catch (error) {
      setMessage(`❌ Action failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleClaim = async () => {
    setLoading(true)
    try {
      await claim(claimAmount || null)
      setMessage(`✅ Claim submitted`)
      setClaimAmount('')
      if (onUpdate) onUpdate()
    } catch (error) {
      setMessage(`❌ Claim failed: ${error.message}`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="job-manager card">
      <h3>⚙️ Manage Job: {role.toUpperCase()}</h3>
      
      <div className="form-group">
        <label>Job ID to Manage:</label>
        <input 
          type="text" 
          value={jobId} 
          onChange={(e) => setJobId(e.target.value)}
          placeholder="Enter job ID..."
          disabled={loading}
        />
      </div>

      <div className="actions-grid">
        {role === 'client' && (
          <>
            <div className="action-group">
              <h4>Assign Freelancer</h4>
              <input 
                type="text" 
                value={freelancerAddress} 
                onChange={(e) => setFreelancerAddress(e.target.value)}
                placeholder="Freelancer address"
                disabled={loading}
              />
              <button 
                onClick={() => handleAction(assignFreelancer, freelancerAddress)}
                disabled={loading || !freelancerAddress}
              >
                👥 Assign
              </button>
            </div>

            <div className="action-group">
              <h4>Release Funds</h4>
              <button 
                onClick={() => handleAction(release)}
                disabled={loading}
                className="success"
              >
                💰 Release
              </button>
            </div>
          </>
        )}

        {(role === 'client' || role === 'freelancer') && (
          <>
            <div className="action-group">
              <h4>Cancel Request</h4>
              <button 
                onClick={() => handleAction(requestCancel)}
                disabled={loading}
                className="warning"
              >
                ❌ Request Cancel
              </button>
            </div>

            <div className="action-group">
              <h4>Approve Cancel</h4>
              <button 
                onClick={() => handleAction(approveCancel)}
                disabled={loading}
                className="warning"
              >
                ✅ Approve Cancel
              </button>
            </div>

            <div className="action-group">
              <h4>Open Dispute</h4>
              <input 
                type="text" 
                value={disputeReason} 
                onChange={(e) => setDisputeReason(e.target.value)}
                placeholder="Reason for dispute"
                disabled={loading}
              />
              <button 
                onClick={() => handleAction(openDispute, disputeReason)}
                disabled={loading}
                className="danger"
              >
                ⚖️ Open Dispute
              </button>
            </div>
          </>
        )}

        {role === 'arbiter' && (
          <div className="action-group">
            <h4>Arbiter Actions</h4>
            <p>Dispute resolution interface coming soon...</p>
          </div>
        )}

        <div className="action-group">
          <h4>Claim Funds</h4>
          <input 
            type="number" 
            value={claimAmount} 
            onChange={(e) => setClaimAmount(e.target.value)}
            placeholder="Amount to claim (empty for all)"
            disabled={loading}
          />
          <button 
            onClick={handleClaim}
            disabled={loading}
            className="success"
          >
            🏦 Claim
          </button>
        </div>
      </div>

      {message && <div className="message">{message}</div>}
    </div>
  )
}

export default JobManager