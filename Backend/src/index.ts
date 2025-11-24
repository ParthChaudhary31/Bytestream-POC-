import express from 'express';
import { config } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';
import { TaprootMonitorService } from './services/taprootMonitorService';

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(corsMiddleware);

// Routes
app.use('/api', routes);

// Error handling middleware (must be last)
app.use(errorHandler);

// Start server
app.listen(config.port, () => {
  console.log(`🚀 Server running on http://localhost:${config.port}`);
  console.log(`📦 Environment: ${config.nodeEnv}`);
  console.log(`🌐 Frontend URL: ${config.frontendUrl}`);
  console.log(`🔗 API Version: ${config.apiVersion}`);

  // Start taproot balance monitoring cron job
  // Schedule: every 1 minute (can be configured via env variable)
  const envCronSchedule = process.env.BALANCE_CHECK_CRON?.trim();
  
  // Validate and use env schedule, or fallback to default
  let cronSchedule = '*/1 * * * *'; // Default: every 1 minute
  
  if (envCronSchedule) {
    // Basic validation: should have 5 or 6 space-separated fields
    const fields = envCronSchedule.split(/\s+/);
    if (fields.length >= 5 && fields.length <= 6) {
      cronSchedule = envCronSchedule;
      console.log(`📅 Using custom cron schedule from env: ${cronSchedule}`);
    } else {
      console.warn(
        `⚠️  Invalid BALANCE_CHECK_CRON format: "${envCronSchedule}". ` +
        `Expected 5 or 6 space-separated fields. Using default: ${cronSchedule}`
      );
    }
  }
  
  try {
    TaprootMonitorService.startMonitoring(cronSchedule);
    console.log(`⏰ Taproot balance monitoring started (schedule: ${cronSchedule})`);
  } catch (error) {
    console.error('❌ Failed to start taproot monitoring:', error);
    console.log('⚠️  Server will continue without balance monitoring');
    // Continue server startup even if monitoring fails
  }

  // Register callback to handle balance change events
  TaprootMonitorService.onBalanceChange((event) => {
    console.log('💰 Balance Change Event:', {
      address: event.address,
      change: event.change > 0 ? `+${event.change} sats` : `${event.change} sats`,
      previousBalance: event.previousBalance,
      currentBalance: event.currentBalance,
      confirmed: event.confirmed,
      unconfirmed: event.unconfirmed,
      timestamp: event.timestamp.toISOString(),
    });
    // TODO: Add your custom event handling logic here
    // For example: emit to websocket, update database, send notification, etc.
  });
});

