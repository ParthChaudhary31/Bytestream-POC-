/**
 * Fix taproot_accounts table indexes
 * Removes duplicate/unnecessary indexes to fix "Too many keys" error
 */

import { connectDatabase, getSequelize } from './src/config/database';

async function fixTaprootIndexes() {
  try {
    console.log('🔧 Fixing taproot_accounts table indexes...\n');

    // Connect to database
    await connectDatabase();
    const sequelize = getSequelize();

    // Get database name from connection
    const dbName = sequelize.getDatabaseName();
    console.log(`📦 Connected to database: ${dbName}\n`);

    // Show current indexes
    console.log('📋 Current indexes on taproot_accounts:');
    const [indexes] = await sequelize.query(`
      SHOW INDEXES FROM taproot_accounts;
    `) as [any[], any];

    console.table(indexes.map((idx: any) => ({
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
      Seq_in_index: idx.Seq_in_index,
    })));

    const indexCount = new Set(indexes.map((idx: any) => idx.Key_name)).size;
    console.log(`\n📊 Total unique indexes: ${indexCount}\n`);

    if (indexCount > 60) {
      console.log('⚠️  Too many indexes detected! Cleaning up...\n');
    }

    // Get all unique index names
    const indexNames = Array.from(new Set(indexes.map((idx: any) => idx.Key_name)));

    // Drop all indexes except PRIMARY
    console.log('🗑️  Dropping all non-primary indexes...');
    for (const indexName of indexNames) {
      if (indexName === 'PRIMARY') {
        continue; // Skip primary key
      }

      try {
        await sequelize.query(`
          ALTER TABLE taproot_accounts DROP INDEX \`${indexName}\`;
        `);
        console.log(`   ✓ Dropped index: ${indexName}`);
      } catch (error: any) {
        if (error.message?.includes("doesn't exist") || error.original?.code === 'ER_CANT_DROP_FIELD_OR_KEY') {
          console.log(`   ⚠️  Index ${indexName} doesn't exist or can't be dropped`);
        } else {
          console.error(`   ❌ Error dropping index ${indexName}:`, error.message);
        }
      }
    }

    // Add back only the unique index on address
    console.log('\n✅ Adding unique index on address...');
    try {
      await sequelize.query(`
        ALTER TABLE taproot_accounts 
        ADD UNIQUE INDEX taproot_accounts_address_unique (address);
      `);
      console.log('   ✓ Added unique index: taproot_accounts_address_unique');
    } catch (error: any) {
      if (error.original?.code === 'ER_DUP_KEYNAME' || error.message?.includes('Duplicate key name')) {
        console.log('   ⚠️  Index already exists');
      } else {
        throw error;
      }
    }

    // Show final indexes
    console.log('\n📋 Final indexes on taproot_accounts:');
    const [finalIndexes] = await sequelize.query(`
      SHOW INDEXES FROM taproot_accounts;
    `) as [any[], any];

    console.table(finalIndexes.map((idx: any) => ({
      Key_name: idx.Key_name,
      Column_name: idx.Column_name,
      Non_unique: idx.Non_unique,
    })));

    const finalCount = new Set(finalIndexes.map((idx: any) => idx.Key_name)).size;
    console.log(`\n✅ Done! Total indexes: ${finalCount}\n`);

    process.exit(0);
  } catch (error: any) {
    console.error('\n❌ Error fixing indexes:', error.message);
    if (error.original) {
      console.error('   Original error:', error.original.message);
    }
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  fixTaprootIndexes();
}

export { fixTaprootIndexes };

