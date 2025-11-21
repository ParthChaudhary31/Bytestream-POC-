import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/walletService';
import { AppError } from '../middleware/errorHandler';

export class WalletController {
  /**
   * Generate a new wallet
   * GET /api/v1/wallet/generate
   */
  static async generateWallet(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const wallet = WalletService.generateWallet();
      res.json({
        success: true,
        data: wallet,
      });
    } catch (error) {
      const appError: AppError = new Error('Failed to generate wallet');
      appError.statusCode = 500;
      next(appError);
    }
  }
}

