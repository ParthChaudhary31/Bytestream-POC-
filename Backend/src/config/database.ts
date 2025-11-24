import { Sequelize } from 'sequelize';
import { config } from './env';

let sequelize: Sequelize | null = null;
let isConnected = false;

export const connectDatabase = async (): Promise<void> => {
  if (isConnected && sequelize) {
    console.log('📦 MySQL already connected');
    return;
  }

  try {
    const dbHost = process.env.DB_HOST || 'localhost';
    const dbPort = parseInt(process.env.DB_PORT || '3306', 10);
    const dbName = process.env.DB_NAME || 'taproot_monitor';
    const dbUser = process.env.DB_USER || 'root';
    const dbPassword = process.env.DB_PASSWORD || '';

    // Debug: Log connection details (without password)
    console.log(`🔌 Connecting to MySQL:`);
    console.log(`   Host: ${dbHost}:${dbPort}`);
    console.log(`   Database: ${dbName}`);
    console.log(`   User: ${dbUser}`);
    console.log(`   Password: ${dbPassword ? '***' : 'NOT SET'}`);

    sequelize = new Sequelize(dbName, dbUser, dbPassword, {
      host: dbHost,
      port: dbPort,
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      pool: {
        max: 5,
        min: 0,
        acquire: 30000,
        idle: 10000,
      },
    });

    await sequelize.authenticate();
    isConnected = true;
    console.log('✅ MySQL connected successfully');
    console.log(`   Database: ${dbName}`);
    console.log(`   Host: ${dbHost}:${dbPort}`);
  } catch (error: any) {
    console.error('❌ MySQL connection error:', error.message);
    isConnected = false;
    throw error;
  }
};

export const disconnectDatabase = async (): Promise<void> => {
  if (!isConnected || !sequelize) {
    return;
  }

  try {
    await sequelize.close();
    sequelize = null;
    isConnected = false;
    console.log('📦 MySQL disconnected');
  } catch (error: any) {
    console.error('❌ MySQL disconnection error:', error.message);
  }
};

export const isDatabaseConnected = (): boolean => isConnected;

export const getSequelize = (): Sequelize => {
  if (!sequelize) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  return sequelize;
};

export const initializeModels = async (): Promise<void> => {
  if (!sequelize) {
    throw new Error('Database not connected. Call connectDatabase() first.');
  }
  
  // Import and initialize models
  const { initializeModels: initModels } = await import('../models');
  
  initModels(sequelize);
  
  // Sync models (creates tables if they don't exist)
  await sequelize.sync({ alter: false });
};

