import { Router } from 'express';
import walletRoutes from './walletRoutes';
import { config } from '../config/env';

const router = Router();

// Health check endpoint
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
  });
});

// API routes
router.use(`/${config.apiVersion}/wallet`, walletRoutes);

export default router;

