import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/walletService';
import { AppError } from '../middleware/errorHandler';

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
<<<<<<< HEAD
      const { userAddress, hubAddress, userPrivateKey, hubPrivateKey, multisigAddress, nonce } = req.body;

      if (!userAddress || !hubAddress || !userPrivateKey || !hubPrivateKey || !multisigAddress) {
=======
      const { userAddress, hubAddress, userPrivateKey, hubPrivateKey, nonce, taprootAddress, broadcastPayload,multisigAddress } = req.body;

      // If broadcastPayload is provided, we can skip validation of other fields
      if (!broadcastPayload) {
        if (!userAddress || !hubAddress || !userPrivateKey || !hubPrivateKey ||!multisigAddress) {
>>>>>>> c7cd2e0beb37f197132ecbe79923f37e9ccfa888
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
<<<<<<< HEAD
        multisigAddress,
        nonce
=======
        nonce,
        taprootAddress,
        broadcastPayload,
        multisigAddress
>>>>>>> c7cd2e0beb37f197132ecbe79923f37e9ccfa888
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
}

