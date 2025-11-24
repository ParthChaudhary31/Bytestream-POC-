import express from 'express';
import { config } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { connectDatabase, initializeModels } from './config/database';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);

// Routes
app.use('/api', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Connect to MySQL and start server
async function startServer() {
  try {
    // Connect to MySQL
    await connectDatabase();
    
    // Initialize and sync database models (creates tables if they don't exist)
    await initializeModels();

    // Start server
    app.listen(config.port, () => {
      console.log(`🚀 Server running on http://localhost:${config.port}`);
      console.log(`📦 Environment: ${config.nodeEnv}`);
      console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
      console.log(`🔗 API Version: ${config.apiVersion}`);
      console.log(`\n✅ Backend API server started (without cron job)`);
      console.log(`   Use 'npm run cron' to start the monitoring cron job separately\n`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

