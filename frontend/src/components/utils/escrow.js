import { useAO } from '../../context/AOContext';

// Hook for escrow-specific operations
export const useEscrow = () => {
  const { sendMessage, readContractState, config, address } = useAO();

  const deposit = async (jobId, amount, meta = {}) => {
    if (!address) throw new Error('Wallet not connected');

    // First transfer tokens to escrow
    await sendMessage(config.TOKEN_PROCESS_ID, 'Transfer', {
      To: config.ESCROW_PROCESS_ID,
      Quantity: amount.toString(),
    });

    // Wait for token transfer to be processed
    await new Promise((resolve) => setTimeout(resolve, 3000));

    // Then deposit to escrow
    return await sendMessage(config.ESCROW_PROCESS_ID, 'Deposit', {
      jobId: jobId,
      amount: amount.toString(),
      token: config.TOKEN_PROCESS_ID,
      meta: JSON.stringify(meta),
    });
  };

  const assignFreelancer = async (jobId, freelancerAddress) => {
    return await sendMessage(config.ESCROW_PROCESS_ID, 'AssignFreelancer', {
      jobId: jobId,
      freelancer: freelancerAddress,
    });
  };

  const release = async (jobId) => {
    return await sendMessage(config.ESCROW_PROCESS_ID, 'Release', {
      jobId: jobId,
    });
  };

  const requestCancel = async (jobId) => {
    return await sendMessage(config.ESCROW_PROCESS_ID, 'RequestCancel', {
      jobId: jobId,
    });
  };

  const approveCancel = async (jobId) => {
    return await sendMessage(config.ESCROW_PROCESS_ID, 'ApproveCancel', {
      jobId: jobId,
    });
  };

  const openDispute = async (jobId, reason = '') => {
    return await sendMessage(config.ESCROW_PROCESS_ID, 'OpenDispute', {
      jobId: jobId,
      reason: reason,
    });
  };

  const claim = async (amount = null) => {
    const tags = { token: config.TOKEN_PROCESS_ID };
    if (amount) {
      tags.amount = amount.toString();
    }
    return await sendMessage(config.ESCROW_PROCESS_ID, 'Claim', tags);
  };

  const getJob = async (jobId) => {
    const result = await sendMessage(config.ESCROW_PROCESS_ID, 'GetJob', {
      jobId: jobId,
    });
    // In real implementation, we'd need to fetch the result message
    return await fetchJobResult(jobId);
  };

  const getPending = async (targetAddress = null) => {
    const tags = {};
    if (targetAddress) {
      tags.addr = targetAddress;
    }
    await sendMessage(config.ESCROW_PROCESS_ID, 'GetPending', tags);
    return await fetchPendingResult(targetAddress || address);
  };

  const getConfig = async () => {
    await sendMessage(config.ESCROW_PROCESS_ID, 'GetConfig', {});
    return await fetchConfigResult();
  };

  // These would be implemented with actual AO result fetching
  const fetchJobResult = async (jobId) => {
    // Implementation would query AO for the result
    return { jobId, status: 'funded', amount: '0' };
  };

  const fetchPendingResult = async (addr) => {
    return [{ token: config.TOKEN_PROCESS_ID, amount: '0' }];
  };

  const fetchConfigResult = async () => {
    return config;
  };

  return {
    deposit,
    assignFreelancer,
    release,
    requestCancel,
    approveCancel,
    openDispute,
    claim,
    getJob,
    getPending,
    getConfig,
    config,
  };
};
