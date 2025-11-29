import axios from 'axios';
import { config } from '../src/config/env';

// Test configuration
export const TEST_CONFIG = {
  baseUrl: `http://localhost:${config.port}/api/${config.apiVersion}/wallet`,
  timeout: 30000, // 30 seconds
  testnetExplorer: 'https://mempool.space/testnet',
};

// Test utilities
export class TestUtils {
  static async wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static async waitForTransaction(txid: string, maxWait: number = 60000): Promise<boolean> {
    const startTime = Date.now();
    while (Date.now() - startTime < maxWait) {
      try {
        const response = await axios.get(`${TEST_CONFIG.testnetExplorer}/api/tx/${txid}`);
        if (response.status === 200) {
          return true;
        }
      } catch (error) {
        // Transaction not found yet, continue waiting
      }
      await this.wait(2000); // Wait 2 seconds before checking again
    }
    return false;
  }

  static async getBalance(address: string): Promise<number> {
    try {
      const response = await axios.get(`${TEST_CONFIG.baseUrl}/balance/${address}?network=testnet`);
      return response.data.balance || 0;
    } catch (error) {
      console.error(`Error fetching balance for ${address}:`, error);
      return 0;
    }
  }

  static logStep(step: string, data?: any): void {
    console.log(`\n[TEST STEP] ${step}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  static logSuccess(message: string, data?: any): void {
    console.log(`\n✅ [SUCCESS] ${message}`);
    if (data) {
      console.log(JSON.stringify(data, null, 2));
    }
  }

  static logError(message: string, error: any): void {
    console.error(`\n❌ [ERROR] ${message}`);
    if (error.response) {
      console.error('Response:', error.response.data);
      console.error('Status:', error.response.status);
    } else {
      console.error('Error:', error.message);
    }
  }
}

