import React, { useState, useEffect } from 'react'
import { useAO } from '../context/AOContext'
import { useEscrow } from './utils/escrow.js'
import TokenTransfer from './TokenTransfer'
import JobCreator from './JobCreator'
import JobManager from './JobManager'
import ContractInfo from './ContractInfo'
import './EscrowDashboard.css'

const EscrowDashboard = () => {
  const { address, connectWallet, disconnectWallet, error } = useAO()
  const { getPending, getConfig } = useEscrow()
  const [pendingBalance, setPendingBalance] = useState('0')
  const [contractConfig, setContractConfig] = useState(null)
  const [role, setRole] = useState('client')
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (address) {
      loadData()
    }
  }, [address])

  const loadData = async () => {
    try {
      setLoading(true)
      const [pending, config] = await Promise.all([
        getPending(),
        getConfig()
      ])
      setPendingBalance(pending[0]?.amount || '0')
      setContractConfig(config)
    } catch (err) {
      setMessage(`Error loading data: ${err.message}`)
    } finally {
      setLoading(false)
    }
  }

  const handleConnect = async () => {
    try {
      setLoading(true)
      await connectWallet()
      setMessage('Wallet connected successfully')
    } catch (err) {
      setMessage(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleDisconnect = async () => {
    await disconnectWallet()
    setPendingBalance('0')
    setContractConfig(null)
    setMessage('Wallet disconnected')
  }

  return (
    <div className="dashboard">
      <header className="header">
        <div className="header-content">
          <h1>🏦 DecentEscrow AO</h1>
          <p>Secure Escrow Service on the AO Computer</p>
        </div>
        
        <div className="wallet-section">
          {address ? (
            <div className="wallet-connected">
              <div className="wallet-info">
                <span className="address">
                  {address.slice(0, 8)}...{address.slice(-8)}
                </span>
                <span className="balance">Balance: {pendingBalance} tAR</span>
              </div>
              <div className="wallet-actions">
                <button onClick={loadData} disabled={loading}>
                  🔄 Refresh
                </button>
                <button onClick={handleDisconnect}>
                  🔌 Disconnect
                </button>
              </div>
            </div>
          ) : (
            <button onClick={handleConnect} className="connect-btn" disabled={loading}>
              {loading ? 'Connecting...' : '🔗 Connect ArConnect'}
            </button>
          )}
        </div>
      </header>

      {error && (
        <div className="error-banner">
          ⚠️ {error}
        </div>
      )}

      {message && (
        <div className="message-banner">
          💡 {message}
        </div>
      )}

      {contractConfig && <ContractInfo config={contractConfig} />}

      {address && (
        <>
          <div className="role-section">
            <h3>Select Your Role:</h3>
            <div className="role-buttons">
              <button 
                className={role === 'client' ? 'active' : ''}
                onClick={() => setRole('client')}
              >
                👤 Client (Fund Escrow)
              </button>
              <button 
                className={role === 'freelancer' ? 'active' : ''}
                onClick={() => setRole('freelancer')}
              >
                👨‍💻 Freelancer (Receive Funds)
              </button>
              <button 
                className={role === 'arbiter' ? 'active' : ''}
                onClick={() => setRole('arbiter')}
              >
                ⚖️ Arbiter (Resolve Disputes)
              </button>
            </div>
          </div>

          <div className="main-content">
            <div className="actions-panel">
              <TokenTransfer onUpdate={loadData} />
              {role === 'client' && <JobCreator onJobCreated={loadData} />}
            </div>
            
            <JobManager role={role} onUpdate={loadData} />
          </div>
        </>
      )}

      {!address && (
        <div className="welcome-section">
          <div className="welcome-card">
            <h2>Welcome to DecentEscrow</h2>
            <p>Secure, decentralized escrow service powered by AO and Arweave</p>
            <div className="features">
              <div className="feature">
                <span>🔒</span>
                <h4>Secure</h4>
                <p>Funds locked in smart contract</p>
              </div>
              <div className="feature">
                <span>⚡</span>
                <h4>Fast</h4>
                <p>AO computer parallel processing</p>
              </div>
              <div className="feature">
                <span>🌐</span>
                <h4>Decentralized</h4>
                <p>No single point of failure</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default EscrowDashboard