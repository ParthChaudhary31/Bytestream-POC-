import express from 'express';
import { config } from './config/env';
import { corsMiddleware } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import routes from './routes';

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
const port = config.port;
app.listen(port, () => {
  if (config.nodeEnv === 'development') {
    console.log(`Server running on http://localhost:${port}`);
    console.log(`Environment: ${config.nodeEnv}`);
  }
});

