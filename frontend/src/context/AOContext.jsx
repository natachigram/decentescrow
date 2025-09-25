import React, { createContext, useContext, useState, useEffect } from 'react'
import { connect } from '@permaweb/aoconnect'
import Arweave from 'arweave'

const AOContext = createContext()

export const useAO = () => {
  const context = useContext(AOContext)
  if (!context) {
    throw new Error('useAO must be used within an AOProvider')
  }
  return context
}

export const AOProvider = ({ children }) => {
  const [ao, setAo] = useState(null)
  const [arweave, setArweave] = useState(null)
  const [address, setAddress] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  // Contract configuration
  const CONTRACT_CONFIG = {
    ESCROW_PROCESS_ID: "ktl0iPdM44_VfTAVF557vSqaF9AfUAFUKDDaQRWyjf0",
    TOKEN_PROCESS_ID: "agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA",
    PLATFORM_TREASURY: "GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU",
    PLATFORM_FEE_BPS: 500,
    ARBITER: "GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU"
  }

  useEffect(() => {
    initializeAO()
  }, [])

  const initializeAO = async () => {
    try {
      setLoading(true)
      setError(null)

      // Initialize Arweave
      const arweaveInstance = Arweave.init({
        host: 'ar-io.net',
        port: 443,
        protocol: 'https'
      })
      setArweave(arweaveInstance)

      // Initialize AO
      const aoInstance = connect({
        arweave: arweaveInstance,
        graphqlURL: 'https://ar-io.net/axn'
      })
      setAo(aoInstance)

      // Check if ArConnect is available
      if (window.arweaveWallet) {
        try {
          await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION'])
          const addr = await window.arweaveWallet.getActiveAddress()
          setAddress(addr)
        } catch (err) {
          console.log('ArConnect not connected:', err)
        }
      }

    } catch (err) {
      setError(`Failed to initialize: ${err.message}`)
      console.error('AO initialization error:', err)
    } finally {
      setLoading(false)
    }
  }

  const connectWallet = async () => {
    try {
      if (!window.arweaveWallet) {
        throw new Error('Please install ArConnect wallet extension')
      }

      await window.arweaveWallet.connect(['ACCESS_ADDRESS', 'SIGN_TRANSACTION'])
      const addr = await window.arweaveWallet.getActiveAddress()
      setAddress(addr)
      setError(null)
      
      return addr
    } catch (err) {
      setError(`Wallet connection failed: ${err.message}`)
      throw err
    }
  }

  const disconnectWallet = async () => {
    try {
      if (window.arweaveWallet) {
        await window.arweaveWallet.disconnect()
      }
      setAddress(null)
    } catch (err) {
      console.error('Disconnect error:', err)
    }
  }

  const sendMessage = async (processId, action, tags = {}, data = null) => {
    if (!ao) {
      throw new Error('AO not initialized')
    }

    try {
      const messageTags = [
        { name: 'Action', value: action },
        ...Object.entries(tags).map(([name, value]) => ({ name, value: value.toString() }))
      ]

      const message = {
        process: processId,
        tags: messageTags,
        data: data || '',
        signer: ao.createDataItemSigner(window.arweaveWallet)
      }

      const messageId = await ao.message(message)
      return messageId
    } catch (err) {
      throw new Error(`Message failed: ${err.message}`)
    }
  }

  const readContractState = async (processId) => {
    if (!ao) {
      throw new Error('AO not initialized')
    }

    try {
      const result = await ao.dryrun({
        process: processId,
        tags: [{ name: 'Action', value: 'GetState' }]
      })
      
      return result.Messages[0]?.Data ? JSON.parse(result.Messages[0].Data) : null
    } catch (err) {
      throw new Error(`Read failed: ${err.message}`)
    }
  }

  const value = {
    ao,
    arweave,
    address,
    loading,
    error,
    connectWallet,
    disconnectWallet,
    sendMessage,
    readContractState,
    config: CONTRACT_CONFIG
  }

  if (loading) {
    return <div className="loading">Initializing AO Connection...</div>
  }

  if (error && !address) {
    return (
      <div className="error">
        <h3>Connection Error</h3>
        <p>{error}</p>
        <button onClick={initializeAO}>Retry</button>
      </div>
    )
  }

  return (
    <AOContext.Provider value={value}>
      {children}
    </AOContext.Provider>
  )
}