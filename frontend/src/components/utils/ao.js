// AO interaction utilities - Browser compatible version
class AOUtils {
  constructor() {
    this.ESCROW_PROCESS_ID = 'ktl0iPdM44_VfTAVF557vSqaF9AfUAFUKDDaQRWyjf0';
    this.TOKEN_PROCESS_ID = 'agYcCFJtrMG6cqMuZfskIkFTGvUPddICmtQSBIoPdiA';
    this.PLATFORM_TREASURY = 'GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU';
    this.PLATFORM_FEE_BPS = 500;
    this.ARBITER = 'GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU';
  }

  // Simulate AO message sending (for demo purposes)
  async sendMessage(target, action, tags = {}, data = null) {
    console.log('Sending message:', { target, action, tags, data });

    // Simulate network delay
    await new Promise((resolve) => setTimeout(resolve, 1000));

    // Return a mock response
    return {
      id: Math.random().toString(36).substr(2, 9),
      timestamp: Date.now(),
    };
  }

  // Token transfer function
  async transferTokens(to, amount) {
    return await this.sendMessage(this.TOKEN_PROCESS_ID, 'Transfer', {
      To: to,
      Quantity: amount.toString(),
    });
  }

  // Deposit funds to escrow
  async deposit(jobId, amount, meta = {}) {
    // Simulate the two-step process
    await this.transferTokens(this.ESCROW_PROCESS_ID, amount);
    await new Promise((resolve) => setTimeout(resolve, 2000));

    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'Deposit', {
      jobId: jobId,
      amount: amount.toString(),
      token: this.TOKEN_PROCESS_ID,
      meta: JSON.stringify(meta),
    });
  }

  // Assign freelancer to job
  async assignFreelancer(jobId, freelancerAddress) {
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'AssignFreelancer', {
      jobId: jobId,
      freelancer: freelancerAddress,
    });
  }

  // Release funds to freelancer
  async release(jobId) {
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'Release', {
      jobId: jobId,
    });
  }

  // Request cancellation
  async requestCancel(jobId) {
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'RequestCancel', {
      jobId: jobId,
    });
  }

  // Approve cancellation
  async approveCancel(jobId) {
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'ApproveCancel', {
      jobId: jobId,
    });
  }

  // Open dispute
  async openDispute(jobId, reason = '') {
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'OpenDispute', {
      jobId: jobId,
      reason: reason,
    });
  }

  // Claim pending balance
  async claim(token = this.TOKEN_PROCESS_ID, amount = null) {
    const tags = { token };
    if (amount) {
      tags.amount = amount.toString();
    }
    return await this.sendMessage(this.ESCROW_PROCESS_ID, 'Claim', tags);
  }

  // Get job details (mock implementation)
  async getJob(jobId) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return mock job data
    return {
      jobId: jobId,
      client: 'arweave-address-of-client',
      freelancer: 'arweave-address-of-freelancer',
      token: this.TOKEN_PROCESS_ID,
      amount: '1000',
      status: 'funded',
      createdAt: Date.now() - 86400000,
      meta: {},
    };
  }

  // Get pending balance (mock implementation)
  async getPending(address = null) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    // Return mock pending balance
    return [
      {
        token: this.TOKEN_PROCESS_ID,
        amount: Math.floor(Math.random() * 1000).toString(),
      },
    ];
  }

  // Get received tokens (mock implementation)
  async getReceivedTokens(address = null, token = this.TOKEN_PROCESS_ID) {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      available: Math.floor(Math.random() * 5000).toString(),
      token: token,
      address: address,
    };
  }

  // Get contract config
  async getConfig() {
    await new Promise((resolve) => setTimeout(resolve, 500));

    return {
      Owner: 'GnLIInpSLP_izxsd38t81JNbKy-SLJ2aDMVd6YPesOU',
      Paused: false,
      arbiter: this.ARBITER,
      platformTreasury: this.PLATFORM_TREASURY,
      platformFeeBps: this.PLATFORM_FEE_BPS,
      defaultToken: this.TOKEN_PROCESS_ID,
      transferMethod: 'direct-transfer',
    };
  }
}

export default new AOUtils();
