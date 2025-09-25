import React from 'react'
import './ContractInfo.css'

const ContractInfo = ({ config }) => {
  return (
    <div className="contract-info card">
      <h3>📋 Contract Information</h3>
      <div className="info-grid">
        <div className="info-item">
          <label>Escrow Process ID:</label>
          <code>{config.ESCROW_PROCESS_ID}</code>
        </div>
        <div className="info-item">
          <label>Token Process ID:</label>
          <code>{config.TOKEN_PROCESS_ID}</code>
        </div>
        <div className="info-item">
          <label>Platform Fee:</label>
          <span>{config.PLATFORM_FEE_BPS / 100}%</span>
        </div>
        <div className="info-item">
          <label>Arbiter:</label>
          <code>{config.ARBITER}</code>
        </div>
        <div className="info-item">
          <label>Platform Treasury:</label>
          <code>{config.PLATFORM_TREASURY}</code>
        </div>
      </div>
    </div>
  )
}

export default ContractInfo