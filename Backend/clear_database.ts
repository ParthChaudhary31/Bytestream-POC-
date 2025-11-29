// Script to clear all database tables
import { connectDatabase, getSequelize, initializeModels } from './src/config/database';
import { PaymentChannel, HubLedger, PaymentCommitment, BalanceEvent, TaprootAccount } from './src/models';

async function clearDatabase() {
  try {
    console.log('🔌 Connecting to database...');
    await connectDatabase();
    
    console.log('📦 Initializing models...');
    await initializeModels();
    
    console.log('🗑️  Clearing all tables...');
    
    // Clear in order (respecting foreign keys)
    await PaymentCommitment.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Cleared payment_commitments');
    
    await HubLedger.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Cleared hub_ledger');
    
    await PaymentChannel.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Cleared payment_channels');
    
    await BalanceEvent.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Cleared balance_events');
    
    await TaprootAccount.destroy({ where: {}, truncate: true, cascade: true });
    console.log('✅ Cleared taproot_accounts');
    
    console.log('\n✅ Database cleared successfully!');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error clearing database:', error.message);
    process.exit(1);
  }
}

clearDatabase();

