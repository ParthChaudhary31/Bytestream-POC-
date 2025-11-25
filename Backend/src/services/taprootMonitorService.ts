import { BalanceService, AddressBalance, BalanceChangeEvent } from './balanceService';
import * as cron from 'node-cron';
import { TaprootAccount as TaprootAccountModel } from '../models';

export interface TaprootAccount {
  address: string;
  userAddress?: string;
  hubAddress?: string;
  createdAt: Date;
  lastBalanceCheck?: Date;
  lastKnownBalance?: AddressBalance;
}

export type BalanceChangeCallback = (event: BalanceChangeEvent) => void;

export class TaprootMonitorService {
  private static accounts: Map<string, TaprootAccount> = new Map();
  private static balanceCache: Map<string, AddressBalance> = new Map();
  private static callbacks: BalanceChangeCallback[] = [];
  private static cronJob: cron.ScheduledTask | null = null;
  private static isRunning = false;
  
  // Configuration for concurrent processing
  private static readonly DEFAULT_CONCURRENCY = parseInt(process.env.BALANCE_CHECK_CONCURRENCY || '5', 10);
  private static readonly MAX_CONCURRENCY = 20; // Maximum concurrent requests to avoid rate limits

  /**
   * Register a taproot address for monitoring
   * Also saves to MySQL if database is available
   * @param skipDbSave - If true, skip saving to database (useful when loading from DB)
   */
  static async registerTaprootAccount(
    address: string,
    userAddress?: string,
    hubAddress?: string,
    skipDbSave: boolean = false
  ): Promise<void> {
    if (!address) {
      throw new Error('Taproot address is required');
    }

    const account: TaprootAccount = {
      address,
      userAddress,
      hubAddress,
      createdAt: new Date(),
    };

    this.accounts.set(address, account);
    console.log(`✅ Registered taproot address for monitoring: ${address}`);

    // Save to MySQL if available and not skipping
    if (!skipDbSave) {
      try {
        await TaprootAccountModel.upsert({
            address,
          userAddress: userAddress || null,
          hubAddress: hubAddress || null,
            isActive: true,
        });
        console.log(`💾 Saved taproot account to database: ${address}`);
      } catch (error: any) {
        // MySQL might not be connected, that's okay
        console.warn(`⚠️  Could not save to database (might not be connected): ${error.message}`);
      }
    }
  }

  /**
   * Unregister a taproot address from monitoring
   */
  static unregisterTaprootAccount(address: string): void {
    this.accounts.delete(address);
    this.balanceCache.delete(address);
    console.log(`❌ Unregistered taproot address: ${address}`);
  }

  /**
   * Get all registered taproot accounts
   */
  static getRegisteredAccounts(): TaprootAccount[] {
    return Array.from(this.accounts.values());
  }

  /**
   * Get account by address
   */
  static getAccount(address: string): TaprootAccount | undefined {
    return this.accounts.get(address);
  }

  /**
   * Register a callback for balance change events
   */
  static onBalanceChange(callback: BalanceChangeCallback): void {
    this.callbacks.push(callback);
  }

  /**
   * Remove a balance change callback
   */
  static removeBalanceChangeCallback(callback: BalanceChangeCallback): void {
    const index = this.callbacks.indexOf(callback);
    if (index > -1) {
      this.callbacks.splice(index, 1);
    }
  }

  /**
   * Emit balance change event to all registered callbacks
   */
  private static emitBalanceChange(event: BalanceChangeEvent): void {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🚨 BALANCE CHANGE DETECTED!`);
    console.log(`${'='.repeat(80)}`);
    console.log(`📊 Account: ${event.address}`);
    console.log(`   Previous Balance: ${event.previousBalance.toLocaleString()} sats`);
    console.log(`   Current Balance: ${event.currentBalance.toLocaleString()} sats`);
    console.log(`   Change: ${event.change > 0 ? '+' : ''}${event.change.toLocaleString()} sats`);
    console.log(`   Confirmed: ${event.confirmed.toLocaleString()} sats`);
    console.log(`   Unconfirmed: ${event.unconfirmed.toLocaleString()} sats`);
    console.log(`   Timestamp: ${event.timestamp.toISOString()}`);
    console.log(`${'='.repeat(80)}\n`);

    this.callbacks.forEach((callback) => {
      try {
        callback(event);
      } catch (error) {
        console.error('Error in balance change callback:', error);
      }
    });
  }

  /**
   * Check balance for a single address
   */
  static async checkBalance(address: string): Promise<AddressBalance> {
    try {
      const account = this.accounts.get(address);
      
      // Display account info
      if (account) {
        console.log(`\n📋 Checking Account:`);
        console.log(`   Address: ${address}`);
        if (account.userAddress) {
          console.log(`   User Address: ${account.userAddress}`);
        }
        if (account.hubAddress) {
          console.log(`   Hub Address: ${account.hubAddress}`);
        }
        console.log(`   Created At: ${account.createdAt.toISOString()}`);
      } else {
        console.log(`\n📋 Checking Address: ${address}`);
      }

      const balance = await BalanceService.fetchBalance(address);
      this.balanceCache.set(address, balance);

      // Display balance info
      console.log(`💰 Balance Details:`);
      console.log(`   Total Balance: ${balance.balance.toLocaleString()} sats`);
      console.log(`   Confirmed: ${balance.confirmed.toLocaleString()} sats`);
      console.log(`   Unconfirmed: ${balance.unconfirmed.toLocaleString()} sats`);
      console.log(`   UTXO Count: ${balance.utxoCount}`);
      console.log(`   Last Checked: ${balance.lastChecked.toISOString()}`);

      if (account) {
        account.lastBalanceCheck = new Date();
        
        // Detect balance change
        const changeEvent = BalanceService.detectBalanceChange(
          account.lastKnownBalance || null,
          balance
        );

        if (changeEvent) {
          this.emitBalanceChange(changeEvent);
        }

        // Show previous balance if exists
        if (account.lastKnownBalance) {
          const previousBalance = account.lastKnownBalance.balance;
          const balanceChange = balance.balance - previousBalance;
          if (balanceChange !== 0) {
            console.log(`   Previous Balance: ${previousBalance.toLocaleString()} sats`);
            console.log(`   Balance Change: ${balanceChange > 0 ? '+' : ''}${balanceChange.toLocaleString()} sats`);
          } else {
            console.log(`   Status: No change from previous check`);
          }
        }

        account.lastKnownBalance = balance;
      }

      return balance;
    } catch (error: any) {
      console.error(`❌ Error checking balance for ${address}:`, error.message);
      throw error;
    }
  }

  /**
   * Process accounts in batches with concurrency limit
   * This prevents overwhelming the API and allows parallel processing
   */
  private static async processBatch<T>(
    items: T[],
    batchSize: number,
    processor: (item: T, index: number) => Promise<void>
  ): Promise<{ success: number; failed: number }> {
    let success = 0;
    let failed = 0;

    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize);
      const batchPromises = batch.map((item, batchIndex) =>
        processor(item, i + batchIndex).then(
          () => { success++; },
          (error) => {
            failed++;
            console.error(`❌ Batch item ${i + batchIndex + 1} failed:`, error.message);
          }
        )
      );

      await Promise.allSettled(batchPromises);
      
      // Small delay between batches to avoid rate limiting
      if (i + batchSize < items.length) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    return { success, failed };
  }

  /**
   * Check balances for all registered addresses
   * OPTIMIZED: Processes multiple accounts concurrently with batch processing
   * Handles hundreds of accounts efficiently by processing in parallel batches
   * 
   * @param concurrency - Number of accounts to process in parallel (default: from env or 5)
   */
  static async checkAllBalances(concurrency?: number): Promise<void> {
    const concurrencyLimit = Math.min(
      concurrency ?? this.DEFAULT_CONCURRENCY,
      this.MAX_CONCURRENCY
    );
    if (this.accounts.size === 0) {
      console.log('⏭️  No taproot accounts registered for monitoring');
      return;
    }

    const timestamp = new Date().toISOString();
    const totalAccounts = this.accounts.size;
    console.log(`\n${'='.repeat(80)}`);
    console.log(`🔍 [${timestamp}] Checking balances for ${totalAccounts} taproot account(s)...`);
    console.log(`⚡ Processing with concurrency: ${concurrency} accounts at a time`);
    console.log(`${'='.repeat(80)}`);

    const addresses = Array.from(this.accounts.keys());
    const startTime = Date.now();
    
    // Process accounts in batches concurrently
    const result = await this.processBatch(
      addresses,
      concurrencyLimit,
      async (address, index) => {
        try {
          console.log(`\n[${index + 1}/${totalAccounts}] Processing account: ${address.substring(0, 20)}...`);
        await this.checkBalance(address);
          console.log(`✅ Account ${index + 1}/${totalAccounts} checked successfully`);
      } catch (error: any) {
        console.error(`❌ Failed to check balance for ${address}:`, error.message);
          throw error; // Re-throw to be caught by processBatch
        }
      }
    );

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n${'='.repeat(80)}`);
    console.log(`✅ Completed balance check for ${totalAccounts} account(s)`);
    console.log(`   Successful: ${result.success}, Failed: ${result.failed}`);
    console.log(`   Duration: ${duration}s (${(totalAccounts / parseFloat(duration)).toFixed(2)} accounts/sec)`);
    console.log(`   Timestamp: ${new Date().toISOString()}`);
    console.log(`${'='.repeat(80)}\n`);
  }

  /**
   * Validate cron schedule format
   * @param schedule - Cron schedule string
   * @returns true if valid, false otherwise
   */
  private static isValidCronSchedule(schedule: string): boolean {
    if (!schedule || typeof schedule !== 'string') {
      return false;
    }

    const trimmed = schedule.trim();
    if (!trimmed) {
      return false;
    }

    // Cron pattern should have 5 or 6 space-separated fields
    // Format: minute hour day month weekday [year]
    const fields = trimmed.split(/\s+/);
    if (fields.length < 5 || fields.length > 6) {
      return false;
    }

    // Basic validation: each field should contain valid cron characters
    // Allowed: *, numbers, ranges, lists, step values, and month/day names
    const validFieldPattern = /^(\*|(\d+(-\d+)?(,\d+(-\d+)?)*|\*\/\d+|[A-Z]{3}))$/i;
    
    // For simplicity, just check if it looks like a cron pattern
    // node-cron will do the actual validation
    return true;
  }

  /**
   * Start the cron job to monitor balances
   * @param schedule - Cron schedule (default: every 1 minute)
   */
  static startMonitoring(schedule: string = '*/1 * * * *'): void {
    if (this.isRunning) {
      console.log('⚠️  Monitoring is already running');
      return;
    }

    // Validate cron schedule format
    if (!this.isValidCronSchedule(schedule)) {
      throw new Error(
        `Invalid cron schedule format: "${schedule}". ` +
        `Expected format: "minute hour day month weekday" (5 fields) or with year (6 fields). ` +
        `Example: "*/1 * * * *" (every minute) or "0 */5 * * *" (every 5 hours)`
      );
    }

    const trimmedSchedule = schedule.trim();

    console.log(`🚀 Starting taproot balance monitoring (schedule: ${trimmedSchedule})`);

    try {
      this.cronJob = cron.schedule(trimmedSchedule, async () => {
        try {
          await this.checkAllBalances();
        } catch (error) {
          console.error('Error in cron job:', error);
        }
      });
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      throw new Error(`Failed to create cron job with schedule "${trimmedSchedule}": ${errorMessage}`);
    }

    this.isRunning = true;
    console.log('✅ Taproot balance monitoring started');
  }

  /**
   * Stop the cron job
   */
  static stopMonitoring(): void {
    if (this.cronJob) {
      this.cronJob.stop();
      this.cronJob = null;
      this.isRunning = false;
      console.log('⏹️  Taproot balance monitoring stopped');
    }
  }

  /**
   * Get current monitoring status
   */
  static getStatus(): {
    isRunning: boolean;
    accountCount: number;
    schedule?: string;
  } {
    return {
      isRunning: this.isRunning,
      accountCount: this.accounts.size,
    };
  }

  /**
   * Manually trigger a balance check (useful for testing)
   */
  static async triggerCheck(): Promise<void> {
    console.log('🔔 Manual balance check triggered');
    await this.checkAllBalances();
  }
}

