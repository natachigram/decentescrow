import React, { useState } from 'react';
import { useAO } from '../context/AOContext';
import './TokenTransfer.css';

const TokenTransfer = ({ onUpdate }) => {
  const { sendMessage, config, address } = useAO();
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  const handleTransfer = async () => {
    if (!to || !amount) {
      setMessage('Please enter recipient and amount');
      return;
    }

    if (!address) {
      setMessage('Please connect wallet first');
      return;
    }

    setLoading(true);
    setMessage('');

    try {
      await sendMessage(config.TOKEN_PROCESS_ID, 'Transfer', {
        To: to,
        Quantity: amount.toString(),
      });

      setMessage(
        `✅ Transfer submitted! ${amount} tAR to ${to.slice(0, 8)}...`
      );
      setTo('');
      setAmount('');

      if (onUpdate) {
        setTimeout(onUpdate, 3000); // Wait for transaction to process
      }
    } catch (error) {
      setMessage(`❌ Transfer failed: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className='token-transfer card'>
      <h3>💸 Transfer Test Tokens</h3>
      <div className='form-group'>
        <label>Recipient Address:</label>
        <input
          type='text'
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder='Enter Arweave address...'
          disabled={loading}
        />
      </div>
      <div className='form-group'>
        <label>Amount (tAR):</label>
        <input
          type='number'
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder='Enter amount...'
          disabled={loading}
        />
      </div>
      <button
        onClick={handleTransfer}
        disabled={loading || !to || !amount}
        className='transfer-btn'
      >
        {loading ? '⏳ Transferring...' : '🚀 Transfer Tokens'}
      </button>
      {message && <div className='message'>{message}</div>}
    </div>
  );
};

export default TokenTransfer;
