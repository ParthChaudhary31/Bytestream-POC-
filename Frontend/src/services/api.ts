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
  async openChannel(userAddress: string, hubAddress: string, capacity: number) {
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
        body: JSON.stringify({ userAddress, hubAddress, capacity }),
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
        capacity: number;
        status: 'opening' | 'open' | 'closing' | 'closed';
        commitmentNumber: number;
        fundingTxid?: string;
        closingTxid?: string;
      }>;
      count: number;
    }>('/wallet/channels/open');
  }
}

export const apiService = new ApiService();

