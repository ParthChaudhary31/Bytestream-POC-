import { connectDatabase, getSequelize } from './src/config/database';
import { PaymentChannel, PaymentCommitment, HubLedger, BalanceEvent, TaprootAccount } from './src/models';

async function clearDb() {
  try {
    await connectDatabase();
    const sequelize = getSequelize();
    console.log('Connected to database.');

    // Disable foreign key checks to allow truncation
    await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
    
    console.log('Clearing PaymentCommitment...');
    await PaymentCommitment.destroy({ where: {}, truncate: true });
    
    console.log('Clearing HubLedger...');
    await HubLedger.destroy({ where: {}, truncate: true });
    
    console.log('Clearing BalanceEvent...');
    await BalanceEvent.destroy({ where: {}, truncate: true });
    
    console.log('Clearing PaymentChannel...');
    await PaymentChannel.destroy({ where: {}, truncate: true });

    console.log('Clearing TaprootAccount...');
    await TaprootAccount.destroy({ where: {}, truncate: true });

    await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

    console.log('✅ Database cleared successfully! You can now start fresh.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error clearing database:', error);
    process.exit(1);
  }
}

clearDb();
