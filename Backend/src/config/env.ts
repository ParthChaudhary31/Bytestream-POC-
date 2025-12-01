import { config as dotenvConfig } from 'dotenv';
import * as path from 'path';

// Load environment variables based on NODE_ENV
const envFile = process.env.NODE_ENV === 'production' 
  ? '.env.prod' 
  : process.env.NODE_ENV === 'staging'
  ? '.env.staging'
  : process.env.NODE_ENV === 'development'
  ? '.env.dev'
  : '.env';

const envPath = path.resolve(process.cwd(), envFile);
const result = dotenvConfig({ path: envPath });

// Fallback to .env if specific env file doesn't exist
if (result.error && envFile !== '.env') {
  dotenvConfig({ path: path.resolve(process.cwd(), '.env') });
}

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // API
  apiVersion: process.env.API_VERSION || 'v1',

  // ByteStream Hub Configuration
  hubAddress: process.env.HUB_ADDRESS || '',
  hubPrivateKey: process.env.HUB_PRIVATE_KEY || '',
  
  // Bitcoin Network Configuration
  bitcoinNetwork: (process.env.BITCOIN_NETWORK || 'testnet') as 'testnet' | 'mainnet',
};

// Validate Hub configuration at startup
if (!config.hubAddress) {
  console.warn('⚠️  HUB_ADDRESS not set in environment variables. Hub operations may fail.');
}

if (!config.hubPrivateKey) {
  console.warn('⚠️  HUB_PRIVATE_KEY not set in environment variables. Hub operations may fail.');
}

