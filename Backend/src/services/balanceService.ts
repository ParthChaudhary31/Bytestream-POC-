import axios from 'axios';

export interface AddressBalance {
  address: string;
  balance: number; // Total balance in sats
  confirmed: number; // Confirmed balance in sats
  unconfirmed: number; // Unconfirmed balance in sats
  utxoCount: number;
  lastChecked: Date;
}

export interface BalanceChangeEvent {
  address: string;
  previousBalance: number;
  currentBalance: number;
  change: number;
  timestamp: Date;
  confirmed: number;
  unconfirmed: number;
}

export class BalanceService {
  private static readonly MEMPOOL_API_BASE = 'https://mempool.space/testnet/api';
  private static readonly MEMPOOL_MAINNET_API_BASE = 'https://mempool.space/api';
  private static readonly BLOCKSTREAM_API_BASE = 'https://blockstream.info/testnet/api';
  private static readonly BLOCKSTREAM_MAINNET_API_BASE = 'https://blockstream.info/api';

  /**
   * Fetch balance directly from address endpoint (FASTER - recommended)
   * This is more efficient than fetching all UTXOs when you only need balance
   */
  static async fetchBalanceDirect(
    address: string,
    network: 'testnet' | 'mainnet' = 'testnet'
  ): Promise<AddressBalance> {
    try {
      const baseUrl = network === 'mainnet'
        ? this.BLOCKSTREAM_MAINNET_API_BASE
        : this.BLOCKSTREAM_API_BASE;

      // Direct balance endpoint - much faster than UTXO endpoint
      const url = `${baseUrl}/address/${address}`;
      const res = await axios.get(url, { timeout: 10000 });

      const addressData = res.data;
      const confirmed = addressData.chain_stats?.funded_txo_sum || 0;
      const unconfirmed = addressData.mempool_stats?.funded_txo_sum || 0;
      const spent = addressData.chain_stats?.spent_txo_sum || 0;
      const unconfirmedSpent = addressData.mempool_stats?.spent_txo_sum || 0;

      // Balance = funded - spent
      const confirmedBalance = confirmed - spent;
      const unconfirmedBalance = unconfirmed - unconfirmedSpent;
      const totalBalance = confirmedBalance + unconfirmedBalance;

      return {
        address,
        balance: totalBalance,
        confirmed: confirmedBalance,
        unconfirmed: unconfirmedBalance,
        utxoCount: addressData.chain_stats?.tx_count || 0,
        lastChecked: new Date(),
      };
    } catch (error: any) {
      if (error.response?.status === 404) {
        return {
          address,
          balance: 0,
          confirmed: 0,
          unconfirmed: 0,
          utxoCount: 0,
          lastChecked: new Date(),
        };
      }
      throw error;
    }
  }

  /**
   * Fetch UTXOs for an address using blockstream.info API
   * Use this when you need individual UTXO details
   */
  static async getUTXO(address: string, network: 'testnet' | 'mainnet' = 'testnet'): Promise<any[]> {
    try {
      const baseUrl = network === 'mainnet' 
        ? this.BLOCKSTREAM_MAINNET_API_BASE 
        : this.BLOCKSTREAM_API_BASE;
      
      const url = `${baseUrl}/address/${address}/utxo`;
      const res = await axios.get(url, { timeout: 10000 });
      return res.data || [];
    } catch (err: any) {
      console.error(`UTXO fetch error for ${address}:`, err.message);
      return [];
    }
  }

  /**
   * Fetch balance for a taproot address
   * OPTIMIZED: Uses direct balance endpoint first (faster), falls back to UTXO method
   * 
   * @param address - Bitcoin address
   * @param network - 'testnet' or 'mainnet'
   * @param useDirectBalance - Use faster direct balance endpoint (default: true)
   * @param useBlockstream - Use blockstream.info (default: true)
   */
  static async fetchBalance(
    address: string, 
    network: 'testnet' | 'mainnet' = 'testnet',
    useDirectBalance: boolean = true,
    useBlockstream: boolean = true
  ): Promise<AddressBalance> {
    try {
      // Method 1: Direct balance endpoint (FASTEST - recommended)
      if (useDirectBalance && useBlockstream) {
        try {
          return await this.fetchBalanceDirect(address, network);
        } catch (directError: any) {
          console.warn(`Direct balance fetch failed for ${address}, trying UTXO method...`);
          // Fall through to UTXO method
        }
      }

      // Method 2: UTXO-based calculation (more detailed, slower)
      let utxos: any[] = [];
      let confirmed = 0;
      let unconfirmed = 0;

      // Try blockstream.info first (more reliable for UTXOs)
      if (useBlockstream) {
        try {
          utxos = await this.getUTXO(address, network);
          
          if (utxos && Array.isArray(utxos)) {
            utxos.forEach((utxo: any) => {
              // blockstream.info UTXO format: { txid, vout, value, status: { confirmed, block_height } }
              if (utxo.status?.confirmed) {
                confirmed += utxo.value || 0;
              } else {
                unconfirmed += utxo.value || 0;
              }
            });
          }
        } catch (blockstreamError: any) {
          console.warn(`Blockstream API failed for ${address}, trying mempool.space...`);
          // Fall through to mempool.space
        }
      }

      // Fallback to mempool.space if blockstream failed
      if (utxos.length === 0 && (!useBlockstream || confirmed === 0 && unconfirmed === 0)) {
        try {
          const mempoolBase = network === 'mainnet'
            ? this.MEMPOOL_MAINNET_API_BASE
            : this.MEMPOOL_API_BASE;
          
          const { data: mempoolUtxos } = await axios.get(
            `${mempoolBase}/address/${address}/utxo`,
            { timeout: 10000 }
          );
          
          if (mempoolUtxos && Array.isArray(mempoolUtxos)) {
            utxos = mempoolUtxos;
            utxos.forEach((utxo: any) => {
              if (utxo.status?.confirmed) {
                confirmed += utxo.value || 0;
              } else {
                unconfirmed += utxo.value || 0;
              }
            });
          }
        } catch (mempoolError: any) {
          // If both fail, continue with zero balance
          console.warn(`Mempool API also failed for ${address}`);
        }
      }

      const totalBalance = confirmed + unconfirmed;

      return {
        address,
        balance: totalBalance,
        confirmed,
        unconfirmed,
        utxoCount: utxos?.length || 0,
        lastChecked: new Date(),
      };
    } catch (error: any) {
      console.error(`Error fetching balance for address ${address}:`, error.message);
      
      // If address not found or no transactions yet, return zero balance
      if (error.response?.status === 404) {
        return {
          address,
          balance: 0,
          confirmed: 0,
          unconfirmed: 0,
          utxoCount: 0,
          lastChecked: new Date(),
        };
      }

      throw new Error(`Failed to fetch balance for address ${address}: ${error.message}`);
    }
  }

  /**
   * Compare two balances and detect changes
   */
  static detectBalanceChange(
    previous: AddressBalance | null,
    current: AddressBalance
  ): BalanceChangeEvent | null {
    if (!previous) {
      // First time checking - only emit if there's a balance
      if (current.balance > 0) {
        return {
          address: current.address,
          previousBalance: 0,
          currentBalance: current.balance,
          change: current.balance,
          timestamp: new Date(),
          confirmed: current.confirmed,
          unconfirmed: current.unconfirmed,
        };
      }
      return null;
    }

    // Check if balance changed
    if (previous.balance !== current.balance) {
      return {
        address: current.address,
        previousBalance: previous.balance,
        currentBalance: current.balance,
        change: current.balance - previous.balance,
        timestamp: new Date(),
        confirmed: current.confirmed,
        unconfirmed: current.unconfirmed,
      };
    }

    return null;
  }
}
