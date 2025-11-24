// Load environment variables FIRST before any other imports
// This ensures dotenv loads before database connection
import './config/env';

import { connectDatabase, disconnectDatabase, initializeModels } from './config/database';
import { TaprootMonitorService } from './services/taprootMonitorService';
import { BalanceEvent, TaprootAccount } from './models';
import * as cron from 'node-cron';

async function startCronJob() {
  try {
    console.log('🔄 Starting Taproot Balance Monitoring Cron Job...\n');

    // Connect to MySQL
    await connectDatabase();
    
    // Initialize and sync database models (creates tables if they don't exist)
    await initializeModels();

    // Load accounts from database
    await loadAccountsFromDatabase();

    // Start taproot balance monitoring cron job
    const envCronSchedule = process.env.BALANCE_CHECK_CRON?.trim();
    
    // Validate and use env schedule, or fallback to default
    let cronSchedule = '*/1 * * * *'; // Default: every 1 minute
    
    if (envCronSchedule) {
      const fields = envCronSchedule.split(/\s+/);
      if (fields.length >= 5 && fields.length <= 6) {
        cronSchedule = envCronSchedule;
        console.log(`📅 Using custom cron schedule from env: ${cronSchedule}`);
      } else {
        console.warn(
          `⚠️  Invalid BALANCE_CHECK_CRON format: "${envCronSchedule}". ` +
          `Using default: ${cronSchedule}`
        );
      }
    }

    // Register callback to handle balance change events and save to MySQL
    TaprootMonitorService.onBalanceChange(async (event) => {
      try {
        // Get account info to include user/hub addresses
        const account = await TaprootAccount.findOne({ where: { address: event.address } });
        
        // Save event to MySQL
        await BalanceEvent.create({
          address: event.address,
          previousBalance: event.previousBalance,
          currentBalance: event.currentBalance,
          change: event.change,
          confirmed: event.confirmed,
          unconfirmed: event.unconfirmed,
          utxoCount: 0, // Will be updated from balance data
          timestamp: event.timestamp,
          userAddress: account?.userAddress || null,
          hubAddress: account?.hubAddress || null,
        });
        console.log(`💾 Balance change event saved to database for ${event.address}`);
      } catch (error: any) {
        console.error('❌ Error saving balance event to database:', error.message);
      }
    });

    // Start monitoring with account reload before each check
    // This ensures new accounts added via API are picked up automatically
    const originalStartMonitoring = TaprootMonitorService.startMonitoring.bind(TaprootMonitorService);
    TaprootMonitorService.startMonitoring = function(schedule: string) {
      // Wrap the cron callback to reload accounts first
      const wrappedSchedule = schedule;
      const cronCallback = async () => {
        try {
          // Reload accounts from database before checking balances
          await loadAccountsFromDatabase();
          // Then proceed with balance check
          await TaprootMonitorService.checkAllBalances();
        } catch (error) {
          console.error('Error in cron job:', error);
        }
      };
      
      // Use node-cron directly to schedule with our wrapped callback
      const cronJob = cron.schedule(wrappedSchedule, cronCallback);
      TaprootMonitorService['cronJob'] = cronJob;
      TaprootMonitorService['isRunning'] = true;
      console.log('✅ Taproot balance monitoring started with auto-reload');
    };

    TaprootMonitorService.startMonitoring(cronSchedule);
    console.log(`⏰ Taproot balance monitoring cron job started (schedule: ${cronSchedule})\n`);
    console.log(`📋 Accounts will be reloaded from database before each balance check\n`);

    // Handle graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down cron job...');
      TaprootMonitorService.stopMonitoring();
      await disconnectDatabase();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down cron job...');
      TaprootMonitorService.stopMonitoring();
      await disconnectDatabase();
      process.exit(0);
    });

  } catch (error: any) {
    console.error('❌ Failed to start cron job:', error.message);
    await disconnectDatabase();
    process.exit(1);
  }
}

async function loadAccountsFromDatabase() {
  try {
    const accounts = await TaprootAccount.findAll({ where: { isActive: true } });
    console.log(`📋 Loading ${accounts.length} active taproot account(s) from database...`);

    const registeredAccounts = TaprootMonitorService.getRegisteredAccounts();
    const registeredAddresses = new Set(registeredAccounts.map(acc => acc.address));

    // Filter out already registered accounts
    const newAccounts = accounts.filter(account => !registeredAddresses.has(account.address));
    
    if (newAccounts.length === 0) {
      if (accounts.length > 0) {
        console.log(`✅ All ${accounts.length} account(s) already registered in monitoring service\n`);
      } else {
        console.log(`⚠️  No active accounts found in database. Register accounts via API.\n`);
      }
      return;
    }

    // Register new accounts concurrently (batch of 10 at a time to avoid overwhelming)
    const batchSize = 10;
    let registeredCount = 0;
    
    for (let i = 0; i < newAccounts.length; i += batchSize) {
      const batch = newAccounts.slice(i, i + batchSize);
      const promises = batch.map(account =>
        TaprootMonitorService.registerTaprootAccount(
          account.address,
          account.userAddress || undefined,
          account.hubAddress || undefined,
          true // skipDbSave = true
        ).catch((error: any) => {
          console.error(`❌ Failed to register account ${account.address}:`, error.message);
        })
      );
      
      await Promise.allSettled(promises);
      registeredCount += batch.length;
      
      // Small delay between batches
      if (i + batchSize < newAccounts.length) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    console.log(`✅ Loaded ${registeredCount} new account(s) into monitoring service (total: ${accounts.length})\n`);
  } catch (error: any) {
    console.error('❌ Error loading accounts from database:', error.message);
  }
}

startCronJob();

