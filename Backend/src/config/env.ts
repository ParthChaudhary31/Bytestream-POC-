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

dotenvConfig({ path: path.resolve(process.cwd(), envFile) });
// Fallback to .env if specific env file doesn't exist
dotenvConfig();

export const config = {
  // Server
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  // Frontend
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',
  corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:3000',

  // API
  apiVersion: process.env.API_VERSION || 'v1',
};

