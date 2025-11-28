/// <reference types="../vite-env" />

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';
const API_VERSION = import.meta.env.VITE_API_VERSION || 'v1';

class ApiService {
  private baseUrl: string;

  constructor() {
    this.baseUrl = `${API_BASE_URL}/api/${API_VERSION}`;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${endpoint}`;
    
    const config: RequestInit = {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...options.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      
      if (!response.ok) {
        const error = await response.json().catch(() => ({
          error: { message: 'An error occurred' },
        }));
        throw new Error(error.error?.message || 'Request failed');
      }

      const data = await response.json();
      return data;
    } catch (error) {
      if (error instanceof Error) {
        throw error;
      }
      throw new Error('Network error occurred');
    }
  }

  // Wallet endpoints
  async generateWallet() {
    return this.request<{ 
      address: string; 
      privateKey: string; 
      publicKey: string; 
      mnemonic: string;
      derivationPath: string;
      network: string;
    }>(
      '/wallet/generate-wallet'
    );
  }

  // Register public key for an address
  async registerPublicKey(address: string, publicKey: string) {
    return this.request<{ success: boolean; message: string }>(
      '/wallet/register-public-key',
      {
        method: 'POST',
        body: JSON.stringify({ address, publicKey }),
      }
    );
  }

  // Create Taproot multisig
  async createTaprootMultisig(address1: string, address2: string) {
    return this.request<{ address: string; scriptHex: string }>(
      '/wallet/create-taproot-multisig',
      {
        method: 'POST',
        body: JSON.stringify({ address1, address2 }),
      }
    );
  }

  // Create and broadcast transaction
  async createTransaction(
    userAddress: string,
    hubAddress: string,
    userPrivateKey: string,
    hubPrivateKey: string,
    nonce?: number,
    taprootAddress?: string,
    broadcastPayload?: string,
    multisigAddress?: string
  ) {
    return this.request<{ success: boolean; txid: string }>(
      '/wallet/create-transaction',
      {
        method: 'POST',
        body: JSON.stringify({
          userAddress,
          hubAddress,
          userPrivateKey,
          hubPrivateKey,
          nonce,
          taprootAddress,
          broadcastPayload,
          multisigAddress,
        }),
      }
    );
  }

  // Health check
  async healthCheck() {
    return this.request<{ status: string; timestamp: string; environment: string }>(
      '/health'
    );
  }

  // Register taproot address for monitoring
  async registerMonitoring(
    address: string,
    userAddress?: string,
    hubAddress?: string
  ) {
    return this.request<{ success: boolean; message: string; address: string }>(
      '/wallet/register-monitoring',
      {
        method: 'POST',
        body: JSON.stringify({ address, userAddress, hubAddress }),
      }
    );
  }

  // Get all registered accounts
  async getAccounts() {
    return this.request<{ accounts: any[]; count: number }>(
      '/wallet/accounts'
    );
  }

  // Get balance events
  async getBalanceEvents(address?: string, limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (address) params.append('address', address);
    if (limit) params.append('limit', limit.toString());
    if (offset) params.append('offset', offset.toString());
    
    return this.request<{ events: any[]; total: number; limit: number; offset: number }>(
      `/wallet/balance-events?${params.toString()}`
    );
  }

  // Lightning-style Channel endpoints
  async openChannel(userAddress: string, capacity: number, userPublicKey?: string, hubPublicKey?: string) {
    return this.request<{
      channelId: string;
      taprootAddress: string;
      userAddress: string;
      hubAddress: string;
      userBalance: number;
      hubBalance: number;
      capacity: number;
      status: 'opening' | 'open' | 'closing' | 'closed';
      commitmentNumber: number;
    }>(
      '/wallet/channel/open',
      {
        method: 'POST',
        body: JSON.stringify({ userAddress, capacity, userPublicKey, hubPublicKey }),
      }
    );
  }

  async confirmFunding(
    channelId: string,
    fundingTxid: string,
    userBalance: number,
    hubBalance: number
  ) {
    return this.request<{
      channelId: string;
      taprootAddress: string;
      userAddress: string;
      hubAddress: string;
      userBalance: number;
      hubBalance: number;
      capacity: number;
      status: 'opening' | 'open' | 'closing' | 'closed';
      commitmentNumber: number;
      fundingTxid?: string;
    }>(
      '/wallet/channel/confirm-funding',
      {
        method: 'POST',
        body: JSON.stringify({ channelId, fundingTxid, userBalance, hubBalance }),
      }
    );
  }

  async updateChannel(
    channelId: string,
    newUserBalance: number,
    newHubBalance: number
  ) {
    return this.request<{
      commitmentNumber: number;
      userBalance: number;
      hubBalance: number;
      commitmentHash: string;
      timestamp: string;
    }>(
      '/wallet/channel/update',
      {
        method: 'POST',
        body: JSON.stringify({ channelId, newUserBalance, newHubBalance }),
      }
    );
  }

  async closeChannel(
    channelId: string,
    userPrivateKey: string,
    hubPrivateKey: string
  ) {
    return this.request<{
      closingTxid: string;
      channelState: {
        channelId: string;
        taprootAddress: string;
        userAddress: string;
        hubAddress: string;
        userBalance: number;
        hubBalance: number;
        capacity: number;
        status: 'opening' | 'open' | 'closing' | 'closed';
        commitmentNumber: number;
        closingTxid?: string;
      };
    }>(
      '/wallet/channel/close',
      {
        method: 'POST',
        body: JSON.stringify({ channelId, userPrivateKey, hubPrivateKey }),
      }
    );
  }

  async getChannel(channelId: string) {
    return this.request<{
      channelId: string;
      taprootAddress: string;
      userAddress: string;
      hubAddress: string;
      userBalance: number;
      hubBalance: number;
      l1Balance?: number;
      capacity: number;
      status: 'opening' | 'open' | 'closing' | 'closed';
      commitmentNumber: number;
      fundingTxid?: string;
      closingTxid?: string;
    }>(`/wallet/channel/${channelId}`);
  }

  async getUserChannels(userAddress: string) {
    return this.request<{
      channels: Array<{
        channelId: string;
        taprootAddress: string;
        userAddress: string;
        hubAddress: string;
        userBalance: number;
        hubBalance: number;
        l1Balance?: number;
        capacity: number;
        status: 'opening' | 'open' | 'closing' | 'closed';
        commitmentNumber: number;
        fundingTxid?: string;
        closingTxid?: string;
      }>;
      count: number;
    }>(`/wallet/channels/user/${userAddress}`);
  }

  async getOpenChannels() {
    return this.request<{
      channels: Array<{
        channelId: string;
        taprootAddress: string;
        userAddress: string;
        hubAddress: string;
        userBalance: number;
        hubBalance: number;
        l1Balance?: number;
        capacity: number;
        status: 'opening' | 'open' | 'closing' | 'closed';
        commitmentNumber: number;
        fundingTxid?: string;
        closingTxid?: string;
      }>;
      count: number;
    }>('/wallet/channels/open');
  }

  // ByteStream L2 routing endpoints
  async routingPayment(senderAddress: string, recipients: Array<{ userAddress: string; amount: number }>) {
    return this.request<{
      success: boolean;
      senderChannel: {
        channelId: string;
        taprootAddress: string;
        userAddress: string;
        hubAddress: string;
        userBalance: number;
        hubBalance: number;
        l1Balance?: number;
        capacity: number;
        status: 'opening' | 'open' | 'closing' | 'closed';
        commitmentNumber: number;
      };
      recipientChannels: Array<{
        userAddress: string;
        channel: {
          channelId: string;
          taprootAddress: string;
          userAddress: string;
          hubAddress: string;
          userBalance: number;
          hubBalance: number;
          l1Balance?: number;
          capacity: number;
          status: 'opening' | 'open' | 'closing' | 'closed';
          commitmentNumber: number;
        };
        commitment: {
          commitmentNumber: number;
          userBalance: number;
          hubBalance: number;
          commitmentHash: string;
          timestamp: string;
        };
      }>;
      totalAmount: number;
      timestamp: string;
    }>(
      '/wallet/channel/routing-payment',
      {
        method: 'POST',
        body: JSON.stringify({ senderAddress, recipients }),
      }
    );
  }

  async getHubLedger(sync: boolean = false) {
    return this.request<{
      ledger: Array<{
        userAddress: string;
        balance: number;
        channelId: string;
        lastUpdated: string;
      }>;
      count: number;
      synced?: boolean;
    }>(`/wallet/hub/ledger${sync ? '?sync=true' : ''}`);
  }

  async syncHubLedger() {
    return this.request<{
      success: boolean;
      message: string;
      ledger: Array<{
        userAddress: string;
        balance: number;
        channelId: string;
        lastUpdated: string;
      }>;
      count: number;
    }>('/wallet/hub/ledger/sync', {
      method: 'POST',
    });
  }

  async clearHubLedger() {
    return this.request<{
      success: boolean;
      message: string;
      ledger: Array<{
        userAddress: string;
        balance: number;
        channelId: string;
        lastUpdated: string;
      }>;
      count: number;
    }>('/wallet/hub/ledger/clear', {
      method: 'POST',
    });
  }

  async unilateralExit(channelId: string, userPrivateKey: string) {
    return this.request<{
      exitTxid: string;
      csvLockTime: string;
      unlockTime: string;
      message: string;
    }>(
      '/wallet/channel/unilateral-exit',
      {
        method: 'POST',
        body: JSON.stringify({ channelId, userPrivateKey }),
      }
    );
  }

  async watchtowerCheck(channelId: string) {
    return this.request<{
      isStale: boolean;
      latestCommitment: number;
      detectedCommitment?: number;
      message: string;
    }>(`/wallet/channel/${channelId}/watchtower`);
  }

  async competingRemedy(channelId: string, staleCommitmentNumber: number) {
    return this.request<{
      remedyTxid: string;
      success: boolean;
      message: string;
    }>(
      '/wallet/channel/competing-remedy',
      {
        method: 'POST',
        body: JSON.stringify({ channelId, staleCommitmentNumber }),
      }
    );
  }
}

export const apiService = new ApiService();

