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
}

export const apiService = new ApiService();

