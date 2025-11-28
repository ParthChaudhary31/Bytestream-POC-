import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/walletService';
import { AppError } from '../middleware/errorHandler';
import { TaprootMonitorService } from '../services/taprootMonitorService';
import { BalanceService } from '../services/balanceService';
import { ChannelService } from '../services/channelService';
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
   * Register public key for an address
   * POST /api/v1/wallet/register-public-key
   */
  static async registerPublicKey(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { address, publicKey } = req.body;

      if (!address || !publicKey) {
        const appError: AppError = new Error('Both address and publicKey are required');
        appError.statusCode = 400;
        return next(appError);
      }

      WalletService.registerPublicKey(address, publicKey);
      
      res.json({
        success: true,
        message: `Public key registered for address ${address}`,
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to register public key');
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
      const { address1, address2, publicKey1, publicKey2 } = req.body;

      if (!address1 || !address2) {
        const appError: AppError = new Error('Both address1 and address2 are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = WalletService.createTaprootMultisig(address1, address2, publicKey1, publicKey2);
      
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

  /**
   * Open a new payment channel (Lightning style)
   * POST /api/v1/wallet/channel/open
   * Hub address is now taken from config
   */
  static async openChannel(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { userAddress, capacity, userPublicKey, hubPublicKey } = req.body;

      if (!userAddress || !capacity) {
        const appError: AppError = new Error('userAddress and capacity are required');
        appError.statusCode = 400;
        return next(appError);
      }

      // Register public keys if provided
      if (userPublicKey) {
        WalletService.registerPublicKey(userAddress, userPublicKey);
      }
      if (hubPublicKey) {
        const { config } = await import('../config/env');
        if (config.hubAddress) {
          WalletService.registerPublicKey(config.hubAddress, hubPublicKey);
        }
      }

      const channel = await ChannelService.openChannel(userAddress, capacity);
      res.json(channel);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to open channel');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Confirm channel funding (after L1 transaction)
   * POST /api/v1/wallet/channel/confirm-funding
   */
  static async confirmFunding(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId, fundingTxid, userBalance, hubBalance } = req.body;

      if (!channelId || !fundingTxid || userBalance === undefined || hubBalance === undefined) {
        const appError: AppError = new Error('channelId, fundingTxid, userBalance, and hubBalance are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const channel = await ChannelService.confirmFunding(channelId, fundingTxid, userBalance, hubBalance);
      res.json(channel);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to confirm funding');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Update channel state (off-chain payment)
   * POST /api/v1/wallet/channel/update
   */
  static async updateChannel(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId, newUserBalance, newHubBalance } = req.body;

      if (!channelId || newUserBalance === undefined || newHubBalance === undefined) {
        const appError: AppError = new Error('channelId, newUserBalance, and newHubBalance are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const commitment = await ChannelService.updateChannelState(channelId, newUserBalance, newHubBalance);
      res.json(commitment);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to update channel');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Close channel (settlement to L1)
   * POST /api/v1/wallet/channel/close
   */
  static async closeChannel(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId, userPrivateKey, hubPrivateKey } = req.body;

      if (!channelId || !userPrivateKey || !hubPrivateKey) {
        const appError: AppError = new Error('channelId, userPrivateKey, and hubPrivateKey are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await ChannelService.closeChannel(channelId, userPrivateKey, hubPrivateKey);
      res.json(result);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to close channel');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get channel by ID
   * GET /api/v1/wallet/channel/:channelId
   */
  static async getChannel(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId } = req.params;

      if (!channelId) {
        const appError: AppError = new Error('channelId is required');
        appError.statusCode = 400;
        return next(appError);
      }

      const channel = await ChannelService.getChannel(channelId);
      
      if (!channel) {
        const appError: AppError = new Error('Channel not found');
        appError.statusCode = 404;
        return next(appError);
      }

      res.json(channel);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get channel');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get all channels for a user
   * GET /api/v1/wallet/channels/user/:userAddress
   */
  static async getUserChannels(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { userAddress } = req.params;

      if (!userAddress) {
        const appError: AppError = new Error('userAddress is required');
        appError.statusCode = 400;
        return next(appError);
      }

      const channels = await ChannelService.getUserChannels(userAddress);
      res.json({ channels, count: channels.length });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get user channels');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get all open channels
   * GET /api/v1/wallet/channels/open
   */
  static async getOpenChannels(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const channels = await ChannelService.getOpenChannels();
      res.json({ channels, count: channels.length });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get open channels');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * 1-to-Many Payment Routing
   * POST /api/v1/wallet/channel/routing-payment
   */
  static async routingPayment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { senderAddress, recipients } = req.body;

      if (!senderAddress || !recipients || !Array.isArray(recipients) || recipients.length === 0) {
        const appError: AppError = new Error('senderAddress and recipients array are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await ChannelService.routingPayment(senderAddress, recipients);
      res.json(result);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to route payment');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Get Hub's internal ledger
   * GET /api/v1/wallet/hub/ledger?sync=true
   */
  static async getHubLedger(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const sync = req.query.sync === 'true' || req.query.sync === '1';
      const ledger = await ChannelService.getHubLedger(sync);
      res.json({ ledger, count: ledger.length, synced: sync });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to get hub ledger');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Sync Hub Ledger with current channel states
   * POST /api/v1/wallet/hub/ledger/sync
   */
  static async syncHubLedger(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      await ChannelService.syncHubLedger();
      const ledger = await ChannelService.getHubLedger(false);
      res.json({ 
        success: true, 
        message: 'Hub ledger synced with current channel states',
        ledger, 
        count: ledger.length 
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to sync hub ledger');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Clear Hub Ledger
   * POST /api/v1/wallet/hub/ledger/clear
   */
  static async clearHubLedger(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      await ChannelService.clearHubLedger();
      res.json({ 
        success: true, 
        message: 'Hub ledger cleared',
        ledger: [],
        count: 0
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to clear hub ledger');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Unilateral Exit (with CSV lock)
   * POST /api/v1/wallet/channel/unilateral-exit
   */
  static async unilateralExit(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId, userPrivateKey } = req.body;

      if (!channelId || !userPrivateKey) {
        const appError: AppError = new Error('channelId and userPrivateKey are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await ChannelService.unilateralExit(channelId, userPrivateKey);
      res.json(result);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to initiate unilateral exit');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Watchtower Check
   * GET /api/v1/wallet/channel/:channelId/watchtower
   */
  static async watchtowerCheck(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId } = req.params;

      if (!channelId) {
        const appError: AppError = new Error('channelId is required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await ChannelService.watchtowerCheck(channelId);
      res.json(result);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to check watchtower');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Competing Remedy Transaction
   * POST /api/v1/wallet/channel/competing-remedy
   */
  static async competingRemedy(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { channelId, staleCommitmentNumber } = req.body;

      if (!channelId || staleCommitmentNumber === undefined) {
        const appError: AppError = new Error('channelId and staleCommitmentNumber are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await ChannelService.competingRemedy(channelId, staleCommitmentNumber);
      res.json(result);
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to create competing remedy');
      appError.statusCode = 500;
      next(appError);
    }
  }
}

