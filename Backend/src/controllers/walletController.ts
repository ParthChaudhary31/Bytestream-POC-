import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/walletService';
import { AppError } from '../middleware/errorHandler';
import { TaprootMonitorService } from '../services/taprootMonitorService';
import { BalanceService } from '../services/balanceService';
import { BalanceEvent, TaprootAccount } from '../models';

export class WalletController {
  /**
   * Generate a new wallet
   * GET /api/v1/wallet/generate-wallet
   */
  static async generateWallet(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const wallet = WalletService.generateWallet();
      res.json({
        address: wallet.address,
        privateKey: wallet.privateKey,
        publicKey: wallet.publicKey,
        mnemonic: wallet.mnemonic,
        derivationPath: wallet.derivationPath,
        network: wallet.network,
      });
    } catch (error) {
      const appError: AppError = new Error('Failed to generate wallet');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Create a Taproot multisig address
   * POST /api/v1/wallet/create-taproot-multisig
   */
  static async createTaprootMultisig(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address1, address2 } = req.body;

      if (!address1 || !address2) {
        const appError: AppError = new Error('Both address1 and address2 are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = WalletService.createTaprootMultisig(address1, address2);
      
      // Automatically register taproot address for monitoring
      TaprootMonitorService.registerTaprootAccount(
        result.address,
        address1,
        address2
      );
      
      res.json({
        address: result.address,
        scriptHex: result.scriptHex,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to create taproot multisig');
      appError.statusCode = 500;
      next(appError);
    }
  }


  /**
   * Create and broadcast a transaction
   * POST /api/v1/wallet/create-transaction
   */
  static async createTransaction(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { userAddress, hubAddress, userPrivateKey, hubPrivateKey, nonce, taprootAddress, broadcastPayload,multisigAddress } = req.body;

      // If broadcastPayload is provided, we can skip validation of other fields
      if (!broadcastPayload) {
        if (!userAddress || !hubAddress || !userPrivateKey || !hubPrivateKey ||!multisigAddress) {
        const appError: AppError = new Error('Missing required fields');
        appError.statusCode = 400;
        return next(appError);
        }
      }

      const txid = await WalletService.createAndBroadcastTransaction(
        userAddress,
        hubAddress,
        userPrivateKey,
        hubPrivateKey,
        nonce,
        taprootAddress,
        broadcastPayload,
        multisigAddress
      );

      res.json({
        success: true,
        txid,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to create transaction');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get balance for a taproot address
   * GET /api/v1/wallet/balance/:address
   */
  static async getBalance(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address } = req.params;
      const { network } = req.query;

      if (!address) {
        const appError: AppError = new Error('Address is required');
        appError.statusCode = 400;
        return next(appError);
      }

      const networkType = (network === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet';
      const balance = await BalanceService.fetchBalance(address, networkType);

      res.json(balance);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to fetch balance');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Check taproot UTXO and balance (similar to /check-taproot endpoint)
   * POST /api/v1/wallet/check-taproot
   */
  static async checkTaproot(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address, network } = req.body;

      if (!address) {
        const appError: AppError = new Error('Address is required');
        appError.statusCode = 400;
        return next(appError);
      }

      const networkType = (network === 'mainnet' ? 'mainnet' : 'testnet') as 'testnet' | 'mainnet';
      
      // Fetch UTXOs using blockstream.info
      const utxos = await BalanceService.getUTXO(address, networkType);
      
      // Calculate total balance
      const balance = utxos.reduce((sum: number, u: any) => sum + (u.value || 0), 0);

      res.json({
        address,
        utxo_count: utxos.length,
        balance_sats: balance,
        utxos,
        network: networkType,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to check taproot');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Register a taproot address for monitoring
   * POST /api/v1/wallet/register-monitoring
   */
  static async registerMonitoring(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address, userAddress, hubAddress } = req.body;

      if (!address) {
        const appError: AppError = new Error('Address is required');
        appError.statusCode = 400;
        return next(appError);
      }

      await TaprootMonitorService.registerTaprootAccount(address, userAddress, hubAddress);

      res.json({
        success: true,
        message: 'Taproot address registered for monitoring',
        address,
        userAddress,
        hubAddress,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to register monitoring');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get all registered taproot accounts
   * GET /api/v1/wallet/monitored-accounts
   */
  static async getMonitoredAccounts(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const accounts = TaprootMonitorService.getRegisteredAccounts();
      const status = TaprootMonitorService.getStatus();

      res.json({
        accounts,
        status,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get monitored accounts');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get monitoring status
   * GET /api/v1/wallet/monitoring-status
   */
  static async getMonitoringStatus(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const status = TaprootMonitorService.getStatus();
      res.json(status);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get monitoring status');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Manually trigger balance check
   * POST /api/v1/wallet/trigger-balance-check
   */
  static async triggerBalanceCheck(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      await TaprootMonitorService.triggerCheck();
      res.json({
        success: true,
        message: 'Balance check triggered',
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to trigger balance check');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get balance events from database
   * GET /api/v1/wallet/balance-events
   */
  static async getBalanceEvents(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address, limit = 50, offset = 0 } = req.query;

      const where: any = {};
      if (address) {
        where.address = address;
      }

      const events = await BalanceEvent.findAll({
        where,
        order: [['timestamp', 'DESC']],
        limit: Number(limit),
        offset: Number(offset),
      });

      const total = await BalanceEvent.count({ where });

      res.json({
        events,
        total,
        limit: Number(limit),
        offset: Number(offset),
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to fetch balance events');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get all registered taproot accounts from database
   * GET /api/v1/wallet/accounts
   */
  static async getAccounts(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { active } = req.query;
      const where: any = {};
      
      if (active !== undefined) {
        where.isActive = active === 'true';
      }

      const accounts = await TaprootAccount.findAll({
        where,
        order: [['createdAt', 'DESC']],
      });

      res.json({
        accounts,
        count: accounts.length,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to fetch accounts');
      appError.statusCode = 500;
      next(appError);
    }
  }
}

