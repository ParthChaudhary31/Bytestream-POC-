import { Request, Response, NextFunction } from 'express';
import { WalletService } from '../services/walletService';
import { AppError } from '../middleware/errorHandler';
import { getDb } from '../db/database';

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
      const { pubkey1, pubkey2 } = req.body;

      if (!pubkey1 || !pubkey2) {
        const appError: AppError = new Error('Both pubkey1 and pubkey2 are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = WalletService.createTaprootMultisig(pubkey1, pubkey2);
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
   * Add a transaction to the database
   * POST /api/v1/wallet/add-transaction
   */
  static async addTransaction(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { sender, receiver, amount, commitment_number, commitment } = req.body;

      if (!sender || !receiver || amount === undefined || commitment_number === undefined || !commitment) {
        const appError: AppError = new Error('Missing required fields: sender, receiver, amount, commitment_number, commitment');
        appError.statusCode = 400;
        return next(appError);
      }

      const db = await getDb();
      const result = await db.run(
        'INSERT INTO transactions (sender, receiver, amount, commitment_number, commitment) VALUES (?, ?, ?, ?, ?)',
        [sender, receiver, amount, commitment_number, commitment]
      );

      res.json({
        message: 'Transaction added successfully',
        id: result.lastID
      });
    } catch (error) {
      const appError: AppError = new Error('Internal Server Error');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Create a commitment PSBT
   * POST /api/v1/wallet/create-commitment
   */
  static async createCommitment(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const {
        senderPrivateKey,
        utxos,
        scriptHex,
        receiverAddress,
        amount,
        multisigAddress
      } = req.body;

      if (!senderPrivateKey || !utxos || !scriptHex || !receiverAddress || amount === undefined || !multisigAddress) {
        const appError: AppError = new Error('Missing required fields');
        appError.statusCode = 400;
        return next(appError);
      }

      if (!Array.isArray(utxos) || utxos.length === 0) {
        const appError: AppError = new Error('utxos must be a non-empty array');
        appError.statusCode = 400;
        return next(appError);
      }

      const commitment = await WalletService.createCommitmentService(
        senderPrivateKey,
        utxos,
        scriptHex,
        receiverAddress,
        amount,
        multisigAddress
      );

      res.json({
        commitment,
        message: 'Commitment created successfully'
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to create commitment');
      appError.statusCode = 500;
      next(appError);
    }
  }

  /**
   * Hub signs and pushes the latest commitment
   * POST /api/v1/wallet/hub-sign-and-push
   */
  static async signAndPush(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { hubPrivateKey, senderAddress } = req.body;

      if (!hubPrivateKey || !senderAddress) {
        const appError: AppError = new Error('Both hubPrivateKey and senderAddress are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const txid = await WalletService.signAndPushService(hubPrivateKey, senderAddress);

      res.json({
        txid,
        message: 'Transaction finalized and broadcast successfully'
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to sign and push transaction');
      appError.statusCode = 500;
      next(appError);
    }
  }
  /**
   * Settle all pending commitments for a receiver
   * POST /api/v1/wallet/settle-commitments
   */
  static async settleCommitments(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const { receiverAddress, hubPrivateKey } = req.body;

      if (!receiverAddress || !hubPrivateKey) {
        const appError: AppError = new Error('Both receiverAddress and hubPrivateKey are required');
        appError.statusCode = 400;
        return next(appError);
      }

      const result = await WalletService.settleUserCommitmentsService(receiverAddress, hubPrivateKey);

      res.json({
        message: 'Settlement process completed',
        results: result
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to settle commitments');
      appError.statusCode = 500;
      next(appError);
    }
  }
  /**
   * Broadcast a transaction (On-Chain)
   * POST /api/v1/wallet/broadcast-transaction
   */
  static async broadcastTransaction(
    req: Request,
    res: Response,
    next: NextFunction
  ) {
    try {
      const {
        userAddress,
        hubAddress,
        userPrivateKey,
        hubPrivateKey,
        amount,
        recipientAddress,
        multisigAddress
      } = req.body;

      if (!userAddress || !hubAddress || !userPrivateKey || !hubPrivateKey || amount === undefined || !recipientAddress) {
        const appError: AppError = new Error('Missing required fields');
        appError.statusCode = 400;
        return next(appError);
      }

      const txid = await WalletService.createAndBroadcastTransaction(
        userAddress,
        hubAddress,
        userPrivateKey,
        hubPrivateKey,
        amount,
        recipientAddress,
        undefined, // nonce
        undefined, // taprootAddress
        undefined, // broadcastPayload
        multisigAddress
      );

      res.json({
        txid,
        message: 'Transaction broadcast successfully'
      });
    } catch (error) {
      const appError: AppError = error instanceof Error
        ? error
        : new Error('Failed to broadcast transaction');
      appError.statusCode = 500;
      next(appError);
    }
  }
}
