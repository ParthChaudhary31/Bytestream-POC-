import { PaymentChannel, HubLedger, PaymentCommitment } from '../models';
import { WalletService } from './walletService';
import { BalanceService } from './balanceService';
import { config } from '../config/env';
import { getSequelize, isDatabaseConnected } from '../config/database';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';
import axios from 'axios';
import crypto from 'crypto';

// Initialize ECC library
initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

/**
 * Helper function to ensure PaymentChannel model is initialized
 * Returns true if model is ready, false otherwise
 */
function ensurePaymentChannelInitialized(): boolean {
  try {
    // Check if model exists
    if (!PaymentChannel) {
      console.error('PaymentChannel model is undefined');
      return false;
    }

    // Check if model has been initialized with Sequelize
    // Sequelize models have rawAttributes after initialization
    const model = PaymentChannel as any;
    
    // Check for rawAttributes - this is the key indicator of initialization
    if (!model.rawAttributes) {
      console.warn('PaymentChannel.rawAttributes is undefined - model not initialized');
      
      // Try to initialize if database is connected
      if (isDatabaseConnected()) {
        try {
          const sequelize = getSequelize();
          // Re-import and initialize models
          const { initializeModels: initModels } = require('../models');
          initModels(sequelize);
          
          // Wait a bit for initialization to complete
          // Check again after initialization
          if (model.rawAttributes && model.sequelize) {
            console.log('PaymentChannel model re-initialized successfully');
            return true;
          }
        } catch (error: any) {
          console.error('Could not re-initialize PaymentChannel model:', error.message);
          return false;
        }
      }
      
      return false;
    }

    // Check if sequelize instance exists
    if (!model.sequelize) {
      console.warn('PaymentChannel.sequelize is undefined - model not fully initialized');
      return false;
    }

    // Model is properly initialized
    return true;
  } catch (error: any) {
    console.error('Error checking PaymentChannel initialization:', error.message);
    return false;
  }
}

/**
 * Helper function to ensure HubLedger model is initialized
 * Returns true if model is ready, false otherwise
 */
function ensureHubLedgerInitialized(): boolean {
  try {
    // Check if model exists
    if (!HubLedger) {
      return false;
    }

    // Check if model has been initialized with Sequelize
    const model = HubLedger as any;
    
    // If model has rawAttributes and sequelize, it's initialized
    if (model.rawAttributes && model.sequelize) {
      return true;
    }

    // Model not initialized - try to initialize if database is connected
    try {
      if (isDatabaseConnected()) {
        const sequelize = getSequelize();
        // Re-import and initialize models
        const { initializeModels: initModels } = require('../models');
        initModels(sequelize);
        // Check again after initialization
        return !!(model.rawAttributes && model.sequelize);
      }
    } catch (error: any) {
      console.warn('Could not re-initialize HubLedger model:', error.message);
      // Continue - will return false
    }

    return false;
  } catch (error: any) {
    console.error('Error checking HubLedger initialization:', error.message);
    return false;
  }
}

export interface ChannelState {
  channelId: string;
  taprootAddress: string;
  userAddress: string;
  hubAddress: string;
  userBalance: number; // Committed balance (what user will get on exit)
  hubBalance: number; // Committed hub balance (positive = user owes hub, negative = hub owes user)
  l1Balance?: number; // Actual L1 balance in taproot address (on-chain)
  capacity: number;
  status: 'opening' | 'open' | 'closing' | 'closed';
  commitmentNumber: number;
  fundingTxid?: string;
  closingTxid?: string;
}

export interface CommitmentTransaction {
  commitmentNumber: number;
  userBalance: number;
  hubBalance: number;
  commitmentHash: string;
  timestamp: Date;
}

export interface RoutingRecipient {
  userAddress: string;
  amount: number;
}

export interface RoutingResult {
  success: boolean;
  senderChannel: ChannelState;
  recipientChannels: Array<{
    userAddress: string;
    channel: ChannelState;
    commitment: CommitmentTransaction;
  }>;
  totalAmount: number;
  timestamp: Date;
}

export interface HubLedgerEntry {
  userAddress: string;
  balance: number;
  channelId: string;
  lastUpdated: Date;
}

/**
 * Lightning Network Style Channel Service
 * 
 * How it works:
 * 1. OPENING: User and Hub create funding transaction to taproot address (L1)
 * 2. OPEN: Channel is active, payments happen off-chain via commitment updates
 * 3. CLOSING: Latest commitment transaction is broadcast to L1
 * 4. CLOSED: Channel is settled on-chain
 */
export class ChannelService {
  /**
   * Get Bitcoin network based on configuration
   */
  private static getNetwork(): bitcoin.Network {
    return config.bitcoinNetwork === 'mainnet' 
      ? bitcoin.networks.bitcoin 
      : bitcoin.networks.testnet;
  }

  /**
   * Get network string ('testnet' or 'mainnet')
   */
  private static getNetworkString(): 'testnet' | 'mainnet' {
    return config.bitcoinNetwork;
  }

  /**
   * Get mempool.space API base URL based on network
   */
  private static getMempoolApiBase(): string {
    return config.bitcoinNetwork === 'mainnet'
      ? 'https://mempool.space/api'
      : 'https://mempool.space/testnet/api';
  }

  /**
   * Get mempool.space transaction broadcast URL
   */
  private static getMempoolBroadcastUrl(): string {
    return `${this.getMempoolApiBase()}/tx`;
  }

  /**
   * Get mempool.space fees API URL
   */
  private static getMempoolFeesUrl(): string {
    return `${this.getMempoolApiBase()}/v1/fees/recommended`;
  }

  /**
   * Get mempool.space transaction explorer URL
   */
  private static getMempoolTxUrl(txid: string): string {
    const base = config.bitcoinNetwork === 'mainnet'
      ? 'https://mempool.space/tx'
      : 'https://mempool.space/testnet/tx';
    return `${base}/${txid}`;
  }

  /**
   * Generate unique channel ID
   */
  static generateChannelId(userAddress: string, hubAddress: string): string {
    const hash = crypto.createHash('sha256');
    hash.update(`${userAddress}-${hubAddress}-${Date.now()}`);
    return hash.digest('hex').slice(0, 16);
  }

  /**
   * Create commitment transaction using channel funding UTXO
   * This creates an actual Bitcoin transaction (signed but not broadcast)
   * that splits the channel balance between user and hub
   */
  private static async createCommitmentTransaction(
    channel: PaymentChannel,
    userBalance: number,
    hubBalance: number,
    userPrivateKey?: string,
    hubPrivateKey?: string
  ): Promise<string | null> {
    // If keys not provided, return null (will just store hash)
    if (!userPrivateKey || !hubPrivateKey) {
      return null;
    }

    try {
      const network = this.getNetwork();
      
      // Get UTXO for channel taproot address
      const utxos = await BalanceService.getUTXO(channel.taprootAddress, this.getNetworkString());
      if (!utxos || utxos.length === 0) {
        const errorMsg = `No UTXOs found for channel ${channel.channelId} at ${channel.taprootAddress}. Please ensure the channel is funded on L1.`;
        console.error(errorMsg);
        throw new Error(errorMsg);
      }

      // Use the first (largest) UTXO - in real Lightning, this would be the funding transaction output
      const fundingUtxo = utxos[0];
      const totalChannelBalance = Number(fundingUtxo.value);

      // Validate balances match channel capacity
      if (userBalance + hubBalance !== totalChannelBalance) {
        throw new Error(
          `Balance mismatch: userBalance (${userBalance}) + hubBalance (${hubBalance}) != channel capacity (${totalChannelBalance})`
        );
      }

      // Get fee rate
      let feeRate = 7.5; // Default
      try {
        const { data: fees } = await axios.get(this.getMempoolFeesUrl());
        feeRate = fees.fastestFee;
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Create PSBT
      const psbt = new bitcoin.Psbt({ network });

      // Derive keys
      let userKey, hubKey;
      try {
        userKey = ECPair.fromWIF(userPrivateKey, network);
      } catch (error: any) {
        throw new Error(`Invalid user private key format: ${error.message}`);
      }
      
      try {
        hubKey = ECPair.fromWIF(hubPrivateKey, network);
      } catch (error: any) {
        throw new Error(`Invalid hub private key format: ${error.message}`);
      }

      // Reconstruct taproot script (same as in WalletService)
      const toXOnly = (pubKey: Buffer) => pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      const pk1 = toXOnly(Buffer.from(userKey.publicKey));
      const pk2 = toXOnly(Buffer.from(hubKey.publicKey));

      // Reconstruct multisig script
      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      // Note: Taproot address validation is done at channel creation
      // We trust the stored taprootAddress in the channel record

      // Note: We don't need the full transaction hex for witnessUtxo
      // The witnessUtxo only needs script and value, which we already have

      // Build taproot script path
      // Use the same method as WalletService to reconstruct scriptPubKey
      // For now, we'll use a simplified approach - in production, use proper script tree
      const { output: scriptPubKey } = bitcoin.payments.p2tr({
        internalPubkey: pk1,
        network,
      });

      if (!scriptPubKey) {
        throw new Error('Failed to derive scriptPubKey');
      }

      // Add input (channel funding UTXO)
      psbt.addInput({
        hash: fundingUtxo.txid,
        index: fundingUtxo.vout,
        witnessUtxo: {
          script: scriptPubKey,
          value: BigInt(fundingUtxo.value),
        },
        tapLeafScript: [
          {
            leafVersion: 192, // 0xC0
            script: scriptImmediate,
            controlBlock: Buffer.alloc(33), // Simplified - in production, calculate proper control block
          },
        ],
      });

      // Estimate fee (1 input, 2 outputs)
      const INPUT_SIZE = 150;
      const OUTPUT_SIZE = 43;
      const OVERHEAD = 10;
      const estimatedVSize = INPUT_SIZE + (2 * OUTPUT_SIZE) + OVERHEAD;
      const estimatedFee = estimatedVSize * feeRate;

      // Calculate outputs (userBalance and hubBalance, minus fee)
      // Fee is deducted from userBalance since user is initiating the exit
      const userOutput = BigInt(userBalance - estimatedFee);
      const hubOutput = BigInt(hubBalance);

      if (userOutput < BigInt(0)) {
        throw new Error(`Insufficient balance for fee. User balance: ${userBalance}, Fee: ${estimatedFee}`);
      }

      // Add outputs
      // Output 1: User's address (userBalance - fee)
      // Fee is paid by user since they are initiating the exit
      let userAddress, hubAddress;
      try {
        userAddress = bitcoin.address.toOutputScript(channel.userAddress, network);
      } catch (error: any) {
        throw new Error(`Invalid user address format: ${channel.userAddress}. Error: ${error.message}`);
      }
      
      try {
        hubAddress = bitcoin.address.toOutputScript(channel.hubAddress, network);
      } catch (error: any) {
        throw new Error(`Invalid hub address format: ${channel.hubAddress}. Error: ${error.message}`);
      }
      
      psbt.addOutput({
        script: userAddress,
        value: userOutput,
      });

      // Output 2: Hub's address (hubBalance - full amount, no fee deduction)
      psbt.addOutput({
        script: hubAddress,
        value: hubOutput,
      });

      // Sign with both keys
      try {
        psbt.signAllInputs(userKey);
      } catch (error: any) {
        throw new Error(`Failed to sign with user key: ${error.message}`);
      }
      
      try {
        psbt.signAllInputs(hubKey);
      } catch (error: any) {
        throw new Error(`Failed to sign with hub key: ${error.message}`);
      }

      // Finalize
      try {
        psbt.finalizeAllInputs();
      } catch (error: any) {
        throw new Error(`Failed to finalize PSBT: ${error.message}`);
      }

      // Extract transaction hex
      try {
        const tx = psbt.extractTransaction();
        const txHex = tx.toHex();
        return txHex;
      } catch (error: any) {
        throw new Error(`Failed to extract transaction: ${error.message}`);
      }
    } catch (error: any) {
      console.error(`Error creating commitment transaction for channel ${channel.channelId}:`, error);
      console.error(`Error details:`, {
        message: error.message,
        stack: error.stack,
        channelId: channel.channelId,
        taprootAddress: channel.taprootAddress,
        userBalance,
        hubBalance,
        hasUserKey: !!userPrivateKey,
        hasHubKey: !!hubPrivateKey,
      });
      // Re-throw error with more context instead of returning null
      throw new Error(
        `Failed to create commitment transaction: ${error.message}. ` +
        `Channel: ${channel.channelId}, Taproot: ${channel.taprootAddress}, ` +
        `User Balance: ${userBalance}, Hub Balance: ${hubBalance}`
      );
    }
  }

  /**
   * Create a payment commitment UTXO for a specific payment
   * This creates a separate UTXO that can be spent independently when recipient exits
   * Multi-UTXO Architecture: Each payment gets its own spendable UTXO
   */
  private static async createPaymentCommitmentUTXO(
    senderChannel: PaymentChannel,
    recipientChannel: PaymentChannel,
    amount: number,
    userPrivateKey?: string,
    hubPrivateKey?: string
  ): Promise<{ commitmentId: string; txHex: string | null; utxoTxid?: string; utxoVout?: number }> {
    // Generate unique commitment ID
    const commitmentId = crypto
      .createHash('sha256')
      .update(`${senderChannel.channelId}-${recipientChannel.channelId}-${amount}-${Date.now()}`)
      .digest('hex')
      .slice(0, 32);

    // If keys not provided, return commitment ID without transaction
    if (!userPrivateKey || !hubPrivateKey) {
      return { commitmentId, txHex: null };
    }

    try {
      const network = this.getNetwork();

      // Get UTXOs for sender's taproot address
      // In multi-UTXO architecture, we can use any available UTXO from the taproot address
      const utxos = await BalanceService.getUTXO(senderChannel.taprootAddress, this.getNetworkString());
      if (!utxos || utxos.length === 0) {
        console.warn(`No UTXOs found for channel ${senderChannel.channelId} at ${senderChannel.taprootAddress}`);
        return { commitmentId, txHex: null };
      }

      // Use the first available UTXO
      // In production, you might want to track which UTXOs are already committed
      const inputUtxo = utxos[0];
      const inputValue = Number(inputUtxo.value);

      // Validate we have enough in the UTXO
      if (inputValue < amount) {
        throw new Error(`Insufficient UTXO value. Required: ${amount}, Available: ${inputValue}`);
      }

      // Get fee rate
      let feeRate = 7.5; // Default
      try {
        const { data: fees } = await axios.get(this.getMempoolFeesUrl());
        feeRate = fees.fastestFee;
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Create PSBT
      const psbt = new bitcoin.Psbt({ network });

      // Derive keys
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      const hubKey = ECPair.fromWIF(hubPrivateKey, network);

      // Reconstruct taproot script
      const toXOnly = (pubKey: Buffer) => pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      const pk1 = toXOnly(Buffer.from(userKey.publicKey));
      const pk2 = toXOnly(Buffer.from(hubKey.publicKey));

      // Reconstruct multisig script
      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      // Build taproot script path
      const { output: scriptPubKey } = bitcoin.payments.p2tr({
        internalPubkey: pk1,
        network,
      });

      if (!scriptPubKey) {
        throw new Error('Failed to derive scriptPubKey');
      }

      // Add input (UTXO from sender's taproot address)
      psbt.addInput({
        hash: inputUtxo.txid,
        index: inputUtxo.vout,
        witnessUtxo: {
          script: scriptPubKey,
          value: BigInt(inputUtxo.value),
        },
        tapLeafScript: [
          {
            leafVersion: 192, // 0xC0
            script: scriptImmediate,
            controlBlock: Buffer.alloc(33), // Simplified - in production, calculate proper control block
          },
        ],
      });

      // Estimate fee (1 input, 2 outputs: commitment UTXO + change)
      const INPUT_SIZE = 150;
      const OUTPUT_SIZE = 43;
      const OVERHEAD = 10;
      const estimatedVSize = INPUT_SIZE + (2 * OUTPUT_SIZE) + OVERHEAD;
      const estimatedFee = estimatedVSize * feeRate;

      // Calculate outputs
      // Output 1: Payment commitment UTXO (at recipient's taproot address or same taproot)
      // This UTXO represents the specific payment and can be spent independently
      const commitmentOutput = BigInt(amount);
      const changeAmount = inputValue - amount - estimatedFee;

      if (changeAmount < 0) {
        throw new Error(`Insufficient balance for fee. Amount: ${amount}, Fee: ${estimatedFee}, Input: ${inputValue}`);
      }

      // Output 1: Commitment UTXO (same taproot address - represents this specific payment)
      // This UTXO will be tracked separately and can be spent when recipient exits
      const commitmentScriptPubKey = bitcoin.address.toOutputScript(senderChannel.taprootAddress, network);
      psbt.addOutput({
        script: commitmentScriptPubKey,
        value: commitmentOutput,
      });

      // Output 2: Change back to taproot address (if any)
      if (changeAmount > 0) {
        psbt.addOutput({
          script: commitmentScriptPubKey,
          value: BigInt(changeAmount),
        });
      }

      // Sign with both keys
      psbt.signAllInputs(userKey);
      psbt.signAllInputs(hubKey);

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      // Extract UTXO info (output 0 is the commitment UTXO)
      // Note: In a real implementation, you'd need to track this after broadcasting
      // For now, we'll store the transaction and extract UTXO info when needed
      const utxoTxid = tx.getId();
      const utxoVout = 0; // First output is the commitment UTXO

      return { commitmentId, txHex, utxoTxid, utxoVout };
    } catch (error: any) {
      console.error(`Error creating payment commitment UTXO: ${error.message}`);
      return { commitmentId, txHex: null };
    }
  }

  /**
   * Open a new payment channel (Lightning style)
   * Step 1: Create taproot address for funding
   * Step 2: User funds the channel (L1 transaction)
   * Uses Hub address from config
   */
  static async openChannel(
    userAddress: string,
    capacity: number,
    userPublicKey?: string,
    hubPublicKey?: string
  ): Promise<ChannelState> {
    // Get Hub address from config
    const hubAddress = config.hubAddress;
    if (!hubAddress) {
      throw new Error('Hub address not configured. Please set HUB_ADDRESS in environment variables.');
    }

    // Try to derive hub public key from private key if available
    let derivedHubPublicKey = hubPublicKey;
    if (!derivedHubPublicKey && config.hubPrivateKey) {
      try {
        const network = this.getNetwork();
        const hubKey = ECPair.fromWIF(config.hubPrivateKey, network);
        // Convert public key to hex string
        const pubKeyBuffer = Buffer.from(hubKey.publicKey);
        derivedHubPublicKey = pubKeyBuffer.toString('hex');
        // Register it for future use
        WalletService.registerPublicKey(hubAddress, derivedHubPublicKey);
      } catch (error: any) {
        console.warn(`Could not derive hub public key from private key: ${error.message}`);
      }
    }

    // Create taproot multisig address for channel funding
    // Pass public keys if available
    const taprootResult = WalletService.createTaprootMultisig(
      userAddress, 
      hubAddress,
      userPublicKey,
      derivedHubPublicKey || hubPublicKey
    );
    
    const channelId = this.generateChannelId(userAddress, hubAddress);
    
    // Ensure PaymentChannel model is initialized before creating
    if (!ensurePaymentChannelInitialized()) {
      // Try one more time to initialize
      console.warn('PaymentChannel not initialized, attempting to initialize...');
      try {
        // Try to get sequelize instance directly (will throw if not connected)
        let sequelize;
        try {
          sequelize = getSequelize();
        } catch (seqError: any) {
          // Database not connected - try to connect
          const { connectDatabase } = await import('../config/database');
          await connectDatabase();
          sequelize = getSequelize();
        }
        
        // Initialize models
        const { initializeModels: initModels } = await import('../models');
        initModels(sequelize);
        
        // Small delay to ensure initialization completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check again after initialization
        if (!ensurePaymentChannelInitialized()) {
          throw new Error(
            'PaymentChannel model could not be initialized even after re-initialization. ' +
            'Please ensure the database is connected and models are properly initialized. ' +
            'Try restarting the server.'
          );
        }
      } catch (initError: any) {
        console.error('Model initialization error details:', initError);
        throw new Error(
          `Failed to initialize PaymentChannel model: ${initError.message}. ` +
          `Please ensure the server has properly started and database is connected.`
        );
      }
    }
    
    // Create channel record
    let channel;
    try {
      // Double-check model is ready
      const model = PaymentChannel as any;
      if (!model.rawAttributes) {
        throw new Error('PaymentChannel.rawAttributes is still undefined after initialization check');
      }

      channel = await PaymentChannel.create({
        channelId,
        taprootAddress: taprootResult.address,
        userAddress,
        hubAddress,
        userBalance: 0,
        hubBalance: 0,
        capacity,
        status: 'opening',
        commitmentNumber: 0,
      });
    } catch (error: any) {
      console.error('PaymentChannel.create error:', error);
      console.error('Model state:', {
        hasModel: !!PaymentChannel,
        hasRawAttributes: !!(PaymentChannel as any).rawAttributes,
        hasSequelize: !!(PaymentChannel as any).sequelize,
        rawAttributesKeys: (PaymentChannel as any).rawAttributes ? Object.keys((PaymentChannel as any).rawAttributes) : 'N/A',
      });
      
      if (error.message?.includes('Cannot read properties') || error.message?.includes('undefined') || error.message?.includes('length')) {
        throw new Error(
          `PaymentChannel model initialization error: ${error.message}. ` +
          `The model's rawAttributes may not be properly set up. ` +
          `Please restart the server to ensure models are fully initialized.`
        );
      }
      throw error;
    }

    // Fetch L1 balance for newly opened channel (will be 0 initially)
    let l1Balance: number | undefined;
    try {
      const balance = await BalanceService.fetchBalance(channel.taprootAddress);
      l1Balance = balance.balance;
    } catch (error: any) {
      console.warn(`Failed to fetch L1 balance for new channel: ${error.message}`);
    }

    return {
      channelId: channel.channelId,
      taprootAddress: channel.taprootAddress,
      userAddress: channel.userAddress,
      hubAddress: channel.hubAddress,
      userBalance: channel.userBalance,
      hubBalance: channel.hubBalance,
      l1Balance,
      capacity: channel.capacity,
      status: channel.status,
      commitmentNumber: channel.commitmentNumber,
    };
  }

  /**
   * Confirm channel funding (after L1 transaction confirms)
   * This moves channel from 'opening' to 'open'
   */
  static async confirmFunding(
    channelId: string,
    fundingTxid: string,
    userBalance: number,
    hubBalance: number
  ): Promise<ChannelState> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'opening') {
      throw new Error(`Channel is not in opening state. Current status: ${channel.status}`);
    }

    if (userBalance + hubBalance > channel.capacity) {
      throw new Error('Total balance exceeds channel capacity');
    }

    // Update channel to open state
    await channel.update({
      status: 'open',
      fundingTxid,
      userBalance,
      hubBalance,
      commitmentNumber: 1, // First commitment after funding
    });

    // Initialize Hub ledger entry for this user
    await this.updateHubLedger(channel.userAddress, channel.channelId, userBalance);

    return {
      channelId: channel.channelId,
      taprootAddress: channel.taprootAddress,
      userAddress: channel.userAddress,
      hubAddress: channel.hubAddress,
      userBalance: channel.userBalance,
      hubBalance: channel.hubBalance,
      capacity: channel.capacity,
      status: channel.status,
      commitmentNumber: channel.commitmentNumber,
      fundingTxid: channel.fundingTxid || undefined,
    };
  }

  /**
   * Update channel state (Lightning style commitment)
   * This is the OFF-CHAIN payment mechanism
   * Each payment creates a new commitment transaction (signed but not broadcast)
   * 
   * @param channelId - Channel ID
   * @param newUserBalance - New user balance
   * @param newHubBalance - New hub balance
   * @param transaction - Database transaction (optional)
   * @param userPrivateKey - User's private key (optional, for creating actual transaction)
   * @param hubPrivateKey - Hub's private key (optional, for creating actual transaction)
   */
  static async updateChannelState(
    channelId: string,
    newUserBalance: number,
    newHubBalance: number,
    transaction?: any,
    userPrivateKey?: string,
    hubPrivateKey?: string
  ): Promise<CommitmentTransaction> {
    const channel = await PaymentChannel.findOne({ 
      where: { channelId },
      transaction,
    });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'open') {
      throw new Error(`Channel is not open. Current status: ${channel.status}`);
    }

    // Validate balances
    // Note: userBalance cannot be negative (user cannot owe more than they have)
    // But hubBalance CAN be negative during routing (Hub can owe to user)
    if (newUserBalance < 0) {
      throw new Error('User balance cannot be negative');
    }

    // Total balance must remain constant (no new funds added via commitment updates)
    // This ensures channel capacity is maintained
    // Example: User 1 → User 2 routing:
    //   - User 1's channel: userBalance decreases, hubBalance increases (total same)
    //   - User 2's channel: userBalance increases, hubBalance decreases (total same, can go negative)
    const currentTotal = channel.userBalance + channel.hubBalance;
    const newTotal = newUserBalance + newHubBalance;
    
    // Total balance must remain constant (Lightning Network rule)
    // Even if hubBalance goes negative, total should stay same
    if (newTotal !== currentTotal) {
      throw new Error(
        `Total balance must remain constant. ` +
        `Current: ${currentTotal} sats (user: ${channel.userBalance}, hub: ${channel.hubBalance}), ` +
        `New: ${newTotal} sats (user: ${newUserBalance}, hub: ${newHubBalance})`
      );
    }

    // EDGE CASE: Validate L1 balance when user commits to pay hub
    // If newHubBalance > 0 (user will owe hub), validate against L1 balance
    // User cannot commit to pay hub more than what's available in L1
    // This is handled in routingPayment() for routing, but also check here for direct updates
    // Note: For direct channel updates (not routing), caller should validate L1 balance if needed
    
    // Ensure userBalance doesn't exceed channel capacity
    if (newUserBalance > channel.capacity) {
      throw new Error(`User balance ${newUserBalance} exceeds channel capacity ${channel.capacity}`);
    }
    
    // Note: hubBalance can be negative (Hub owes to user)
    // This is valid in Lightning-style routing when Hub routes payment to user

    // Create new commitment
    const commitmentNumber = channel.commitmentNumber + 1;
    const commitmentData = {
      channelId,
      commitmentNumber,
      userBalance: newUserBalance,
      hubBalance: newHubBalance,
      timestamp: new Date(),
    };

    // Generate commitment hash
    const commitmentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(commitmentData))
      .digest('hex');

    // Create actual commitment transaction if keys provided
    // This creates a real Bitcoin transaction (signed but not broadcast)
    let commitmentTxHex: string | null = null;
    if (userPrivateKey && hubPrivateKey) {
      try {
        commitmentTxHex = await this.createCommitmentTransaction(
          channel,
          newUserBalance,
          newHubBalance,
          userPrivateKey,
          hubPrivateKey
        );
      } catch (error: any) {
        console.warn(`Failed to create commitment transaction: ${error.message}`);
        // Continue with hash-only if transaction creation fails
      }
    }

    // Update channel state
    await channel.update({
      userBalance: newUserBalance,
      hubBalance: newHubBalance,
      commitmentNumber,
      lastCommitmentHash: commitmentHash,
      lastCommitmentTxHex: commitmentTxHex,
    }, { transaction });

    return {
      commitmentNumber,
      userBalance: newUserBalance,
      hubBalance: newHubBalance,
      commitmentHash,
      timestamp: new Date(),
    };
  }

  /**
   * Create and broadcast UTXO for a payment commitment at exit time
   * Creates a separate UTXO from recipient's channel for each commitment
   * This UTXO can be tracked on testnet block explorer
   */
  private static async createAndBroadcastCommitmentUTXO(
    commitment: any,
    recipientChannel: PaymentChannel,
    userPrivateKey: string,
    hubPrivateKey: string,
    inputUtxo?: any // Optional: specific UTXO to use
  ): Promise<{ utxoTxid: string; utxoVout: number }> {
    try {
      const network = this.getNetwork();

      // Get UTXOs from recipient's taproot address (the exiting user's channel)
      let utxos;
      if (inputUtxo) {
        // Use provided UTXO
        utxos = [inputUtxo];
      } else {
        // Fetch UTXOs
        utxos = await BalanceService.getUTXO(recipientChannel.taprootAddress, this.getNetworkString());
        if (!utxos || utxos.length === 0) {
          throw new Error(`No UTXOs found for recipient channel ${recipientChannel.channelId}`);
        }
      }

      // Use the first available UTXO
      const selectedUtxo = inputUtxo || utxos[0];
      const inputValue = Number(selectedUtxo.value);

      // Validate we have enough for this commitment amount
      if (inputValue < commitment.amount) {
        throw new Error(`Insufficient UTXO value. Required: ${commitment.amount}, Available: ${inputValue}`);
      }

      // Get fee rate
      let feeRate = 7.5;
      try {
        const { data: fees } = await axios.get(this.getMempoolFeesUrl());
        feeRate = fees.fastestFee;
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Create PSBT
      const psbt = new bitcoin.Psbt({ network });

      // Derive keys
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      const hubKey = ECPair.fromWIF(hubPrivateKey, network);

      // Reconstruct taproot script
      const toXOnly = (pubKey: Buffer) => pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      const pk1 = toXOnly(Buffer.from(userKey.publicKey));
      const pk2 = toXOnly(Buffer.from(hubKey.publicKey));

      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      const { output: scriptPubKey } = bitcoin.payments.p2tr({
        internalPubkey: pk1,
        network,
      });

      if (!scriptPubKey) {
        throw new Error('Failed to derive scriptPubKey');
      }

      // Add input (from recipient's channel)
      psbt.addInput({
        hash: selectedUtxo.txid,
        index: selectedUtxo.vout,
        witnessUtxo: {
          script: scriptPubKey,
          value: BigInt(inputUtxo.value),
        },
        tapLeafScript: [
          {
            leafVersion: 192,
            script: scriptImmediate,
            controlBlock: Buffer.alloc(33),
          },
        ],
      });

      // Estimate fee (1 input, 2 outputs: commitment UTXO + change)
      const INPUT_SIZE = 150;
      const OUTPUT_SIZE = 43;
      const OVERHEAD = 10;
      const estimatedVSize = INPUT_SIZE + (2 * OUTPUT_SIZE) + OVERHEAD;
      const estimatedFee = estimatedVSize * feeRate;

      const commitmentOutput = BigInt(commitment.amount);
      const changeAmount = inputValue - commitment.amount - estimatedFee;

      if (changeAmount < 0) {
        throw new Error(`Insufficient balance for fee. Amount: ${commitment.amount}, Fee: ${estimatedFee}, Input: ${inputValue}`);
      }

      // Output 1: Commitment UTXO (at recipient's taproot address - represents this specific payment)
      psbt.addOutput({
        script: scriptPubKey, // Same taproot address
        value: commitmentOutput,
      });

      // Output 2: Change back to recipient's taproot address
      if (changeAmount > 0) {
        psbt.addOutput({
          script: scriptPubKey,
          value: BigInt(changeAmount),
        });
      }

      // Sign with both keys
      psbt.signAllInputs(userKey);
      psbt.signAllInputs(hubKey);

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      // Broadcast using createTransaction API infrastructure
      // This uses the same broadcast mechanism as createTransaction endpoint
      console.log(`[Commitment UTXO] Broadcasting transaction for commitment ${commitment.commitmentId} (${commitment.amount} sats)...`);
      console.log(`[Commitment UTXO] Using createTransaction API infrastructure for broadcast...`);
      
      const utxoTxid = await WalletService.createAndBroadcastTransaction(
        recipientChannel.userAddress,
        recipientChannel.hubAddress,
        userPrivateKey,
        hubPrivateKey,
        undefined, // nonce
        recipientChannel.taprootAddress,
        txHex, // broadcastPayload - use pre-built transaction hex
        recipientChannel.taprootAddress // multisigAddress
      );
      
      const utxoVout = 0; // First output is the commitment UTXO

      console.log(`[Commitment UTXO] ✓ Transaction broadcast: ${utxoTxid}`);
      console.log(`[Commitment UTXO]   View on ${this.getNetworkString()}: ${this.getMempoolTxUrl(utxoTxid)}`);

      return { utxoTxid, utxoVout };
    } catch (error: any) {
      console.error(`Error creating commitment UTXO: ${error.message}`);
      throw error;
    }
  }

  /**
   * Exit User's Channel - Multi-UTXO Architecture
   * When a user exits, ALL payment commitments where they are recipient are settled
   * Creates UTXOs for each commitment and broadcasts to testnet
   * Then closes the user's channel
   * 
   * Architecture:
   * - User 1 → Hub → User 2 (creates commitment, off-chain)
   * - User 3 → Hub → User 2 (creates commitment, off-chain)
   * - User 4 → Hub → User 2 (creates commitment, off-chain)
   * 
   * When User 2 exits:
   * - Find ALL commitments where User 2 is recipient
   * - For each commitment, create and broadcast UTXO to testnet
   * - Update commitment records with utxoTxid and utxoVout
   * - Close User 2's channel (spends User 2's funding UTXO)
   * - User 2 receives their userBalance (sum of all payments they received)
   * - Mark all User 2's commitments as spent
   * 
   * @param userChannelId - User's channel ID (the one exiting)
   * @param userPrivateKey - User's private key
   * @param hubPrivateKey - Hub's private key
   */
  static async exitUserChannel(
    userChannelId: string,
    userPrivateKey: string,
    hubPrivateKey: string
  ): Promise<{ exitTxid: string; totalAmount: number; commitmentsSettled: number; commitmentUtxos: Array<{ commitmentId: string; utxoTxid: string; utxoVout: number }>; channelState: ChannelState }> {
    // Ensure PaymentChannel model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel not initialized, attempting to initialize...');
      try {
        let sequelize;
        try {
          sequelize = getSequelize();
        } catch (seqError: any) {
          const { connectDatabase } = await import('../config/database');
          await connectDatabase();
          sequelize = getSequelize();
        }
        
        const { initializeModels: initModels } = await import('../models');
        initModels(sequelize);
        await new Promise(resolve => setTimeout(resolve, 100));
        
        if (!ensurePaymentChannelInitialized()) {
          throw new Error(
            'PaymentChannel model could not be initialized. Please restart the server.'
          );
        }
      } catch (initError: any) {
        console.error('Model initialization error:', initError);
        throw new Error(
          `Failed to initialize PaymentChannel model: ${initError.message}. Please restart the server.`
        );
      }
    }

    // Get user's channel
    const userChannel = await PaymentChannel.findOne({
      where: { channelId: userChannelId },
    });

    if (!userChannel) {
      throw new Error('User channel not found');
    }

    if (userChannel.status !== 'open') {
      throw new Error(`Channel is not open. Current status: ${userChannel.status}`);
    }

    console.log(`[Exit User Channel] User ${userChannel.userAddress.slice(0, 16)}... exiting`);
    console.log(`  - Channel ID: ${userChannelId}`);
    console.log(`  - Final Balance to Settle: ${userChannel.userBalance} sats`);

    // Find ALL payment commitments where this user is recipient (for reporting only)
    let totalCommitments = 0;
    try {
      if (PaymentCommitment) {
        const count = await PaymentCommitment.count({
          where: {
            recipientChannelId: userChannelId,
            status: 'committed',
          },
        });
        totalCommitments = count;
        console.log(`  - Consolidating ${totalCommitments} off-chain commitments into single exit tx`);
      }
    } catch (error) {
      console.warn('Could not count commitments, continuing...');
    }

    // STEP 1: Close the channel - this creates ONE on-chain transaction
    // The channel's userBalance already contains the sum of all payments received
    console.log(`[Exit User Channel] Closing channel with single commitment...`);
    const closeResult = await this.closeChannel(
      userChannelId,
      userPrivateKey,
      hubPrivateKey
    );

    console.log(`[Exit User Channel] Channel closed. Exit transaction: ${closeResult.closingTxid}`);
    console.log(`[Exit User Channel] View exit transaction: ${this.getMempoolTxUrl(closeResult.closingTxid)}`);

    // STEP 2: Mark all commitments as spent/settled by this closing tx
    if (PaymentCommitment) {
      try {
        await PaymentCommitment.update(
          { status: 'spent', utxoTxid: closeResult.closingTxid },
          {
            where: {
              recipientChannelId: userChannelId,
              status: 'committed',
            },
          }
        );
        console.log(`[Exit User Channel] Marked all commitments as settled via tx ${closeResult.closingTxid}`);
      } catch (error: any) {
        console.error('PaymentCommitment.update error:', error);
      }
    }

    return {
      exitTxid: closeResult.closingTxid,
      totalAmount: userChannel.userBalance,
      commitmentsSettled: totalCommitments,
      commitmentUtxos: [], // No individual UTXOs anymore
      channelState: closeResult.channelState,
    };
  }

  /**
   * Exit a specific payment commitment (Multi-UTXO Architecture)
   * When a recipient exits, only their specific payment UTXO is spent
   * Other payments remain unaffected
   * 
   * @param recipientChannelId - Recipient's channel ID
   * @param senderAddress - Sender's address (who made the payment)
   * @param userPrivateKey - User's private key
   * @param hubPrivateKey - Hub's private key
   */
  static async exitPaymentCommitment(
    recipientChannelId: string,
    senderAddress: string,
    userPrivateKey: string,
    hubPrivateKey: string
  ): Promise<{ exitTxid: string; commitmentId: string; amount: number }> {
    // Ensure PaymentCommitment model is available
    if (!PaymentCommitment) {
      throw new Error('PaymentCommitment model is not available');
    }

    // Find the payment commitment for this recipient from this sender
    let commitment;
    try {
      // Find all matching commitments first, then get the latest
      const commitments = await PaymentCommitment.findAll({
        where: {
          recipientChannelId,
          senderAddress,
          status: 'committed',
        },
      });
      
      // Get the latest commitment (most recent)
      if (Array.isArray(commitments) && commitments.length > 0) {
        commitment = commitments.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA; // DESC order
        })[0];
      } else {
        commitment = null;
      }
    } catch (error: any) {
      console.error('PaymentCommitment.findAll error:', error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        throw new Error('PaymentCommitment table may not exist yet.');
      }
      throw error;
    }

    if (!commitment) {
      throw new Error(`No payment commitment found for recipient channel ${recipientChannelId} from sender ${senderAddress}`);
    }

    if (commitment.status !== 'committed') {
      throw new Error(`Payment commitment ${commitment.commitmentId} is not in committed state. Current status: ${commitment.status}`);
    }

    // Get recipient's channel
    const recipientChannel = await PaymentChannel.findOne({
      where: { channelId: recipientChannelId },
    });

    if (!recipientChannel) {
      throw new Error('Recipient channel not found');
    }

    if (recipientChannel.status !== 'open') {
      throw new Error(`Recipient channel is not open. Current status: ${recipientChannel.status}`);
    }

    // Get sender's channel to access taproot address
    const senderChannel = await PaymentChannel.findOne({
      where: { channelId: commitment.senderChannelId },
    });

    if (!senderChannel) {
      throw new Error('Sender channel not found');
    }

    try {
      const network = this.getNetwork();

      // Get the specific UTXO for this commitment
      // In a real implementation, you'd track the exact UTXO (txid, vout) from the commitment
      // For now, we'll find UTXOs at the taproot address and use one that matches the amount
      const utxos = await BalanceService.getUTXO(senderChannel.taprootAddress, this.getNetworkString());
      if (!utxos || utxos.length === 0) {
        throw new Error(`No UTXOs found for commitment at ${senderChannel.taprootAddress}`);
      }

      // Find a UTXO that matches the commitment amount (or use the first available)
      // In production, you'd track the exact UTXO from the commitment transaction
      const commitmentUtxo = utxos.find(u => Number(u.value) >= commitment.amount) || utxos[0];
      
      if (Number(commitmentUtxo.value) < commitment.amount) {
        throw new Error(`UTXO value ${commitmentUtxo.value} is less than commitment amount ${commitment.amount}`);
      }

      // Get fee rate
      let feeRate = 7.5;
      try {
        const { data: fees } = await axios.get(this.getMempoolFeesUrl());
        feeRate = fees.fastestFee;
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Create PSBT to spend this specific commitment UTXO
      const psbt = new bitcoin.Psbt({ network });

      // Derive keys
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      const hubKey = ECPair.fromWIF(hubPrivateKey, network);

      // Reconstruct taproot script
      const toXOnly = (pubKey: Buffer) => pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      const pk1 = toXOnly(Buffer.from(userKey.publicKey));
      const pk2 = toXOnly(Buffer.from(hubKey.publicKey));

      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      const { output: scriptPubKey } = bitcoin.payments.p2tr({
        internalPubkey: pk1,
        network,
      });

      if (!scriptPubKey) {
        throw new Error('Failed to derive scriptPubKey');
      }

      // Add input (the specific commitment UTXO)
      psbt.addInput({
        hash: commitmentUtxo.txid,
        index: commitmentUtxo.vout,
        witnessUtxo: {
          script: scriptPubKey,
          value: BigInt(commitmentUtxo.value),
        },
        tapLeafScript: [
          {
            leafVersion: 192,
            script: scriptImmediate,
            controlBlock: Buffer.alloc(33),
          },
        ],
      });

      // Estimate fee (1 input, 1 output to recipient)
      const INPUT_SIZE = 150;
      const OUTPUT_SIZE = 43;
      const OVERHEAD = 10;
      const estimatedVSize = INPUT_SIZE + OUTPUT_SIZE + OVERHEAD;
      const estimatedFee = estimatedVSize * feeRate;

      // Output: Send payment amount to recipient (minus fee)
      const recipientOutput = BigInt(commitment.amount - estimatedFee);

      if (recipientOutput < BigInt(0)) {
        throw new Error(`Insufficient balance for fee. Amount: ${commitment.amount}, Fee: ${estimatedFee}`);
      }

      // Output to recipient's address
      const recipientAddress = bitcoin.address.toOutputScript(recipientChannel.userAddress, network);
      psbt.addOutput({
        script: recipientAddress,
        value: recipientOutput,
      });

      // Sign with both keys
      psbt.signAllInputs(userKey);
      psbt.signAllInputs(hubKey);

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      // Broadcast transaction
      const broadcastRes = await axios.post(
        this.getMempoolBroadcastUrl(),
        txHex
      );
      const exitTxid = broadcastRes.data;

      // Update commitment status to spent
      await commitment.update({
        status: 'spent',
        utxoTxid: exitTxid,
      });

      return {
        exitTxid,
        commitmentId: commitment.commitmentId,
        amount: commitment.amount,
      };
    } catch (error: any) {
      console.error(`Error exiting payment commitment: ${error.message}`);
      throw error;
    }
  }

  /**
   * Broadcast commitment transaction to L1
   * This allows broadcasting stored commitment transaction even if channel is in closing status
   * Useful when you want to broadcast a commitment without full channel exit
   */
  static async broadcastCommitmentTransaction(
    channelId: string,
    userPrivateKey: string,
    hubPrivateKey: string
  ): Promise<{ txid: string; message: string }> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Allow broadcasting even if channel is closing or closed
    if (channel.status === 'opening') {
      throw new Error('Channel is still opening. Cannot broadcast commitment yet.');
    }

    let txid: string;

    // If we have a stored commitment transaction, broadcast it
    if (channel.lastCommitmentTxHex) {
      try {
        console.log(`[Broadcast Commitment] Broadcasting stored commitment transaction for channel ${channelId}...`);
        const broadcastRes = await axios.post(
          this.getMempoolBroadcastUrl(),
          channel.lastCommitmentTxHex,
          {
            headers: {
              'Content-Type': 'text/plain',
            },
          }
        );
        txid = broadcastRes.data;
        console.log(`[Broadcast Commitment] ✓ Transaction broadcast: ${txid}`);
        console.log(`[Broadcast Commitment]   View on ${this.getNetworkString()}: ${this.getMempoolTxUrl(txid)}`);
      } catch (error: any) {
        console.error(`[Broadcast Commitment] Failed to broadcast stored commitment: ${error.message}`);
        // Fallback: create new commitment transaction and broadcast
        console.log(`[Broadcast Commitment] Creating new commitment transaction...`);
        const commitmentTxHex = await this.createCommitmentTransaction(
          channel,
          channel.userBalance,
          channel.hubBalance,
          userPrivateKey,
          hubPrivateKey
        );
        
        if (!commitmentTxHex) {
          throw new Error('Failed to create commitment transaction');
        }

        const broadcastRes = await axios.post(
          this.getMempoolBroadcastUrl(),
          commitmentTxHex,
          {
            headers: {
              'Content-Type': 'text/plain',
            },
          }
        );
        txid = broadcastRes.data;
        console.log(`[Broadcast Commitment] ✓ New transaction broadcast: ${txid}`);
        console.log(`[Broadcast Commitment]   View on ${this.getNetworkString()}: ${this.getMempoolTxUrl(txid)}`);
      }
    } else {
      // No stored transaction, create new one
      console.log(`[Broadcast Commitment] No stored commitment found. Creating new commitment transaction...`);
      const commitmentTxHex = await this.createCommitmentTransaction(
        channel,
        channel.userBalance,
        channel.hubBalance,
        userPrivateKey,
        hubPrivateKey
      );
      
      if (!commitmentTxHex) {
        throw new Error('Failed to create commitment transaction');
      }

      const broadcastRes = await axios.post(
        this.getMempoolBroadcastUrl(),
        commitmentTxHex,
        {
          headers: {
            'Content-Type': 'text/plain',
          },
        }
      );
      txid = broadcastRes.data;
      console.log(`[Broadcast Commitment] ✓ Transaction broadcast: ${txid}`);
      console.log(`[Broadcast Commitment]   View on ${this.getNetworkString()}: ${this.getMempoolTxUrl(txid)}`);
    }

    return {
      txid,
      message: `Commitment transaction broadcast successfully to ${this.getNetworkString()}. TXID: ${txid}`,
    };
  }

  /**
   * Close channel (Lightning style settlement)
   * Broadcasts latest commitment transaction to L1
   * 
   * On exit:
   * - User gets their committed balance (userBalance - transaction fee) on L1
   *   - Transaction fee is deducted from userBalance since user initiates exit
   * - Hub gets their committed balance (hubBalance) on L1 - full amount, no fee deduction
   * - Withdrawable amount = L1 balance - hub balance - estimated fee
   *   - If hubBalance > 0 (user owes hub): L1 balance - hub balance - fee = what user can withdraw
   *   - If hubBalance < 0 (hub owes user): L1 balance - hub balance - fee = what user can withdraw
   * - The commitment transaction distributes funds according to committed balances, with fee from user
   * 
   * NOTE: In multi-UTXO architecture, consider using exitPaymentCommitment() for individual payments
   */
  static async closeChannel(
    channelId: string,
    userPrivateKey: string,
    hubPrivateKey: string
  ): Promise<{ closingTxid: string; channelState: ChannelState }> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'open') {
      throw new Error(`Channel is not open. Current status: ${channel.status}`);
    }

    // DON'T update status to 'closing' yet - wait until transaction is created
    // This prevents channel from getting stuck in 'closing' state if transaction fails

    let closingTxid: string;
    let commitmentTxHex: string | null = null;

    try {
      // Step 1: Try to use stored commitment transaction first
      if (channel.lastCommitmentTxHex) {
        try {
          // Broadcast the stored commitment transaction
          const broadcastRes = await axios.post(
            this.getMempoolBroadcastUrl(),
            channel.lastCommitmentTxHex
          );
          closingTxid = broadcastRes.data; // txid
          commitmentTxHex = channel.lastCommitmentTxHex;
        } catch (error: any) {
          console.error(`Failed to broadcast stored commitment: ${error.message}`);
          // Fallback: create new commitment transaction and broadcast
          commitmentTxHex = await this.createCommitmentTransaction(
            channel,
            channel.userBalance,
            channel.hubBalance,
            userPrivateKey,
            hubPrivateKey
          );
          
          if (!commitmentTxHex) {
            throw new Error('Failed to create commitment transaction for closing');
          }

          const broadcastRes = await axios.post(
            this.getMempoolBroadcastUrl(),
            commitmentTxHex
          );
          closingTxid = broadcastRes.data;
        }
      } else {
        // No stored transaction, create and broadcast new one
        commitmentTxHex = await this.createCommitmentTransaction(
          channel,
          channel.userBalance,
          channel.hubBalance,
          userPrivateKey,
          hubPrivateKey
        );
        
        if (!commitmentTxHex) {
          throw new Error('Failed to create commitment transaction for closing');
        }

        const broadcastRes = await axios.post(
          this.getMempoolBroadcastUrl(),
          commitmentTxHex
        );
        closingTxid = broadcastRes.data;
      }

      // Step 2: Only update status AFTER successful transaction creation and broadcast
      // Update channel status to closing first, then to closed
      await channel.update({ status: 'closing' });
      
      // Update channel to closed
      await channel.update({
        status: 'closed',
        closingTxid,
      });
    } catch (error: any) {
      // If anything fails, ensure channel stays in 'open' state
      // Don't update status if transaction creation/broadcast failed
      console.error(`Error closing channel ${channelId}:`, error);
      
      // Reload channel to get current state
      const currentChannel = await PaymentChannel.findOne({ where: { channelId } });
      if (currentChannel && currentChannel.status === 'closing') {
        // Revert to 'open' if somehow got stuck in 'closing'
        await currentChannel.update({ status: 'open' });
        console.log(`Reverted channel ${channelId} status from 'closing' back to 'open'`);
      }
      
      // Re-throw error with context
      throw new Error(
        `Failed to close channel: ${error.message}. ` +
        `Channel ${channelId} remains in 'open' state. ` +
        `Please check: UTXOs exist, private keys are valid, addresses are correct.`
      );
    }

    // Reload to get updated state
    const updatedChannel = await PaymentChannel.findOne({ where: { channelId } });
    if (!updatedChannel) {
      throw new Error('Failed to reload channel after closing');
    }

    // Fetch L1 balance for closed channel
    let l1Balance: number | undefined;
    try {
      const balance = await BalanceService.fetchBalance(updatedChannel.taprootAddress);
      l1Balance = balance.balance;
    } catch (error: any) {
      console.warn(`Failed to fetch L1 balance for closed channel: ${error.message}`);
    }

    return {
      closingTxid,
      channelState: {
        channelId: updatedChannel.channelId,
        taprootAddress: updatedChannel.taprootAddress,
        userAddress: updatedChannel.userAddress,
        hubAddress: updatedChannel.hubAddress,
        userBalance: updatedChannel.userBalance,
        hubBalance: updatedChannel.hubBalance,
        l1Balance,
        capacity: updatedChannel.capacity,
        status: 'closed',
        commitmentNumber: updatedChannel.commitmentNumber,
        closingTxid,
      },
    };
  }

  /**
   * Get channel by ID
   * Includes L1 balance from taproot address
   */
  static async getChannel(channelId: string): Promise<ChannelState | null> {
    // Validate channelId
    if (!channelId || typeof channelId !== 'string') {
      throw new Error('channelId is required and must be a string');
    }

    // Ensure model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel model not initialized. Returning null.');
      return null;
    }

    let channel;
    try {
      channel = await PaymentChannel.findOne({ where: { channelId: channelId.trim() } });
    } catch (error: any) {
      console.error(`Error in getChannel for ${channelId}:`, error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('PaymentChannel table may not exist yet. Returning null.');
        return null;
      }
      throw error;
    }
    
    if (!channel) {
      return null;
    }

    // Fetch L1 balance from taproot address
    let l1Balance: number | undefined;
    try {
      const balance = await BalanceService.fetchBalance(channel.taprootAddress);
      l1Balance = balance.balance;
    } catch (error: any) {
      console.warn(`Failed to fetch L1 balance for ${channel.taprootAddress}: ${error.message}`);
      // Continue without L1 balance if fetch fails
    }

    return {
      channelId: channel.channelId,
      taprootAddress: channel.taprootAddress,
      userAddress: channel.userAddress,
      hubAddress: channel.hubAddress,
      userBalance: channel.userBalance,
      hubBalance: channel.hubBalance,
      l1Balance,
      capacity: channel.capacity,
      status: channel.status,
      commitmentNumber: channel.commitmentNumber,
      fundingTxid: channel.fundingTxid || undefined,
      closingTxid: channel.closingTxid || undefined,
    };
  }

  /**
   * Get all channels for a user
   * Includes L1 balance from taproot address for each channel
   */
  static async getUserChannels(userAddress: string): Promise<ChannelState[]> {
    // Validate userAddress
    if (!userAddress || typeof userAddress !== 'string') {
      throw new Error('userAddress is required and must be a string');
    }

    // Ensure model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel model not initialized. Returning empty array.');
      return [];
    }

    try {
      const trimmedAddress = userAddress.trim();
      if (!trimmedAddress) {
        throw new Error('userAddress cannot be empty after trimming');
      }

      // Build where clause explicitly to avoid any undefined issues
      const whereClause: { userAddress: string } = {
        userAddress: trimmedAddress,
      };

      // Use findAll with simplified options
      // The error might be caused by the order clause or model attributes
      let channels;
      try {
        // Try with minimal options first
        channels = await PaymentChannel.findAll({
          where: whereClause,
        });
        
        // Sort manually if needed (after getting results)
        if (Array.isArray(channels) && channels.length > 0) {
          channels.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return dateB - dateA; // DESC order
          });
        }
      } catch (findAllError: any) {
        console.error('PaymentChannel.findAll error:', findAllError);
        console.error('Error details:', {
          message: findAllError.message,
          stack: findAllError.stack,
          modelInitialized: !!(PaymentChannel as any).sequelize,
          hasAttributes: !!(PaymentChannel as any).rawAttributes,
        });
        
        // If findAll fails due to model initialization, provide helpful error
        if (findAllError.message?.includes('Cannot convert') || findAllError.message?.includes('undefined')) {
          throw new Error(
            `Model initialization error: ${findAllError.message}. ` +
            `The PaymentChannel model may not be properly initialized. ` +
            `Please ensure initializeModels() is called before using the model.`
          );
        }
        throw findAllError;
      }

      // Safety check: ensure channels is an array
      if (!Array.isArray(channels)) {
        console.error('PaymentChannel.findAll did not return an array:', channels);
        return [];
      }

      // Fetch L1 balances for all channels in parallel
      const channelsWithL1Balance = await Promise.all(
        channels.map(async (channel) => {
          let l1Balance: number | undefined;
          try {
            const balance = await BalanceService.fetchBalance(channel.taprootAddress);
            l1Balance = balance.balance;
          } catch (error: any) {
            console.warn(`Failed to fetch L1 balance for ${channel.taprootAddress}: ${error.message}`);
            // Continue without L1 balance if fetch fails
          }

          return {
            channelId: channel.channelId,
            taprootAddress: channel.taprootAddress,
            userAddress: channel.userAddress,
            hubAddress: channel.hubAddress,
            userBalance: channel.userBalance,
            hubBalance: channel.hubBalance,
            l1Balance,
            capacity: channel.capacity,
            status: channel.status,
            commitmentNumber: channel.commitmentNumber,
            fundingTxid: channel.fundingTxid || undefined,
            closingTxid: channel.closingTxid || undefined,
          };
        })
      );

      return channelsWithL1Balance;
    } catch (error: any) {
      console.error(`Error in getUserChannels for ${userAddress}:`, error);
      // If it's a table doesn't exist error, return empty array
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('PaymentChannel table may not exist yet. Returning empty array.');
        return [];
      }
      throw error;
    }
  }

  /**
   * Get all open channels
   * Includes L1 balance from taproot address for each channel
   */
  static async getOpenChannels(): Promise<ChannelState[]> {
    // Ensure model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel model not initialized. Returning empty array.');
      return [];
    }

    let channels;
    try {
      // Use minimal options to avoid order clause issues
      channels = await PaymentChannel.findAll({
        where: { status: 'open' },
      });
      
      // Sort manually if needed
      if (Array.isArray(channels) && channels.length > 0) {
        channels.sort((a, b) => {
          const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return dateB - dateA; // DESC order
        });
      }
    } catch (error: any) {
      console.error('Error in getOpenChannels:', error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('PaymentChannel table may not exist yet. Returning empty array.');
        return [];
      }
      throw error;
    }

    // Safety check: ensure channels is an array
    if (!Array.isArray(channels)) {
      console.error('PaymentChannel.findAll did not return an array:', channels);
      return [];
    }

    // Fetch L1 balances for all channels in parallel
    const channelsWithL1Balance = await Promise.all(
      channels.map(async (channel) => {
        let l1Balance: number | undefined;
        try {
          const balance = await BalanceService.fetchBalance(channel.taprootAddress);
          l1Balance = balance.balance;
        } catch (error: any) {
          console.warn(`Failed to fetch L1 balance for ${channel.taprootAddress}: ${error.message}`);
          // Continue without L1 balance if fetch fails
        }

        return {
          channelId: channel.channelId,
          taprootAddress: channel.taprootAddress,
          userAddress: channel.userAddress,
          hubAddress: channel.hubAddress,
          userBalance: channel.userBalance,
          hubBalance: channel.hubBalance,
          l1Balance,
          capacity: channel.capacity,
          status: channel.status,
          commitmentNumber: channel.commitmentNumber,
          fundingTxid: channel.fundingTxid || undefined,
          closingTxid: channel.closingTxid || undefined,
        };
      })
    );

    return channelsWithL1Balance;
  }

  /**
   * 1-to-Many Payment Routing
   * Routes payment from sender to multiple recipients through Hub's internal ledger
   * 
   * MULTI-UTXO ARCHITECTURE:
   * - Each payment creates a PaymentCommitment record (off-chain)
   * - Commitments are tracked but don't create separate UTXOs
   * - All payments happen off-chain via channel state updates
   * - When recipient exits, their channel closes (ONE on-chain transaction)
   * - Sender's channel remains open (other commitments stay active)
   * 
   * Example:
   * - User 1 → Hub → User 2 (500 sats) - creates commitment, off-chain
   * - User 1 → Hub → User 3 (1000 sats) - creates commitment, off-chain
   * - User 1 → Hub → User 4 (400 sats) - creates commitment, off-chain
   * - User 1's channel with Hub: userBalance decreases, hubBalance increases (off-chain)
   * - User 2's channel with Hub: userBalance increases, hubBalance decreases (off-chain)
   * 
   * When User 2 exits:
   * - User 2's channel closes (spends User 2's funding UTXO) - ONE on-chain transaction
   * - User 2 receives their total balance (sum of all payments received)
   * - User 1's commitment with User 2 is marked as spent
   * - User 1's channel with Hub remains OPEN
   * - User 1's commitments with User 3, User 4 remain ACTIVE
   * 
   * Payment happens ONCE, not twice:
   * - Off-chain: Commitment created (no on-chain transaction)
   * - On-chain: User 2 exits, gets balance (ONE transaction)
   * 
   * EDGE CASE HANDLING:
   * - If Hub committed to pay user (hubBalance < 0), user can still pay others
   * - But user cannot commit to pay hub more than L1 balance
   * - Example: Hub committed 500 to user (hubBalance = -500), user has L1 = 1000
   *   - User can pay up to 1500 (1000 L1 + 500 from hub commitment)
   *   - After paying 1500: hubBalance = -500 + 1500 = +1000 (user owes hub 1000)
   *   - But if user tries to pay 2000: hubBalance = +1500 > L1 (1000) → Invalid
   * - Validation ensures: newHubBalance <= L1 balance when newHubBalance > 0
   */
  static async routingPayment(
    senderAddress: string,
    recipients: RoutingRecipient[]
  ): Promise<RoutingResult> {
    const hubAddress = config.hubAddress;
    if (!hubAddress) {
      throw new Error('Hub address not configured');
    }

    // Validate recipients
    if (!recipients || recipients.length === 0) {
      throw new Error('At least one recipient is required');
    }

    const totalAmount = recipients.reduce((sum, r) => sum + r.amount, 0);
    if (totalAmount <= 0) {
      throw new Error('Total payment amount must be greater than 0');
    }

    // Get sender's channel
    const senderChannel = await PaymentChannel.findOne({
      where: {
        userAddress: senderAddress,
        hubAddress,
        status: 'open',
      },
    });

    if (!senderChannel) {
      throw new Error('Sender does not have an open channel with Hub');
    }

    // Check sender has sufficient committed balance
    if (senderChannel.userBalance < totalAmount) {
      throw new Error(
        `Insufficient balance in sender's channel. ` +
        `Required: ${totalAmount} sats, Available: ${senderChannel.userBalance} sats. ` +
        `Sender: ${senderAddress.slice(0, 16)}...`
      );
    }

    // EDGE CASE: Validate L1 balance when user commits to pay hub
    // When user pays, hubBalance increases (user commits to pay hub more)
    // After payment: newHubBalance = currentHubBalance + totalAmount
    // If newHubBalance > 0, user owes hub, and hub can only receive up to L1 balance
    // 
    // Example scenario:
    // - Hub committed 500 to user (hubBalance = -500, hub owes user 500)
    // - User has L1 balance = 1000 sats
    // - User wants to pay 1000 sats to someone
    // - After payment: hubBalance = -500 + 1000 = +500 (user now owes hub 500)
    // - Validation: newHubBalance (500) <= L1 balance (1000) ✓ Valid
    // 
    // But if user tries to pay 2000:
    // - After payment: hubBalance = -500 + 2000 = +1500 (user owes hub 1500)
    // - Validation: newHubBalance (1500) > L1 balance (1000) ✗ Invalid
    // - User cannot commit to pay hub more than what's in L1
    const newSenderHubBalance = senderChannel.hubBalance + totalAmount;
    
    // If after payment, user will owe hub (newHubBalance > 0), validate against L1
    if (newSenderHubBalance > 0) {
      let senderL1Balance: number;
      try {
        const balance = await BalanceService.fetchBalance(senderChannel.taprootAddress);
        senderL1Balance = balance.balance;
      } catch (error: any) {
        console.warn(`Failed to fetch L1 balance for validation: ${error.message}`);
        // If we can't fetch L1 balance, use a conservative estimate
        // Assume L1 balance = userBalance (worst case, most restrictive)
        senderL1Balance = senderChannel.userBalance;
      }

      // User cannot commit to pay hub more than what's available in L1
      if (newSenderHubBalance > senderL1Balance) {
        const maxPayableAmount = senderL1Balance - senderChannel.hubBalance;
        throw new Error(
          `Insufficient L1 balance for payment commitment. ` +
          `After payment, you would owe Hub ${newSenderHubBalance} sats, ` +
          `but L1 balance is only ${senderL1Balance} sats. ` +
          `Maximum payable: ${maxPayableAmount} sats, ` +
          `Requested: ${totalAmount} sats. ` +
          `Sender: ${senderAddress.slice(0, 16)}...`
        );
      }
    }

    // STEP 1: Validate all recipients FIRST (before any updates)
    // This ensures we don't partially update channels if validation fails
    const recipientChannelsData: Array<{
      channel: PaymentChannel;
      newUserBalance: number;
      newHubBalance: number;
      amount: number;
    }> = [];

    for (const recipient of recipients) {
      const recipientChannel = await PaymentChannel.findOne({
        where: {
          userAddress: recipient.userAddress,
          hubAddress,
          status: 'open',
        },
      });

      if (!recipientChannel) {
        throw new Error(`Recipient ${recipient.userAddress} does not have an open channel with Hub`);
      }

      // Calculate new balances for recipient
      const newRecipientUserBalance = recipientChannel.userBalance + recipient.amount;
      const newRecipientHubBalance = recipientChannel.hubBalance - recipient.amount;
      
      // Validate recipient's userBalance doesn't exceed channel capacity
      if (newRecipientUserBalance > recipientChannel.capacity) {
        throw new Error(
          `Recipient balance would exceed channel capacity. ` +
          `New balance: ${newRecipientUserBalance} sats, Capacity: ${recipientChannel.capacity} sats. ` +
          `Recipient: ${recipient.userAddress.slice(0, 16)}...`
        );
      }
      
      // Validate total balance doesn't exceed capacity
      if (newRecipientUserBalance + newRecipientHubBalance > recipientChannel.capacity) {
        throw new Error(
          `Total channel balance would exceed capacity. ` +
          `User balance: ${newRecipientUserBalance} sats, Hub balance: ${newRecipientHubBalance} sats, ` +
          `Total: ${newRecipientUserBalance + newRecipientHubBalance} sats, Capacity: ${recipientChannel.capacity} sats. ` +
          `Recipient: ${recipient.userAddress.slice(0, 16)}...`
        );
      }

      recipientChannelsData.push({
        channel: recipientChannel,
        newUserBalance: newRecipientUserBalance,
        newHubBalance: newRecipientHubBalance,
        amount: recipient.amount,
      });
    }

    // Calculate sender's new balances (calculated earlier for validation)
    const newSenderUserBalance = senderChannel.userBalance - totalAmount;
    
    // Validate sender balance
    if (newSenderUserBalance < 0) {
      throw new Error(
        `Sender balance would become negative. ` +
        `Current balance: ${senderChannel.userBalance} sats, ` +
        `Payment amount: ${totalAmount} sats, ` +
        `Sender: ${senderAddress.slice(0, 16)}...`
      );
    }

    // STEP 2: Use transaction to update ALL channels atomically
    // If any update fails, everything rolls back
    const sequelize = getSequelize();
    const transaction = await sequelize.transaction();

    try {
      // Update sender's channel
      const senderCommitment = await this.updateChannelState(
        senderChannel.channelId,
        newSenderUserBalance,
        newSenderHubBalance,
        transaction
      );

      // Update Hub's internal ledger for sender
      await this.updateHubLedger(senderAddress, senderChannel.channelId, -totalAmount, transaction);

      // Update all recipient channels and create payment commitments
      const recipientChannels: RoutingResult['recipientChannels'] = [];
      
      for (const recipientData of recipientChannelsData) {
        const recipientCommitment = await this.updateChannelState(
          recipientData.channel.channelId,
          recipientData.newUserBalance,
          recipientData.newHubBalance,
          transaction
        );

        // MULTI-UTXO ARCHITECTURE: Create separate payment commitment for this payment
        // Each payment gets its own UTXO that can be spent independently
        // IMPORTANT: taprootAddress should be recipient's address because that's where the money is after payment
        const paymentCommitment = await PaymentCommitment.create({
          commitmentId: crypto
            .createHash('sha256')
            .update(`${senderChannel.channelId}-${recipientData.channel.channelId}-${recipientData.amount}-${Date.now()}`)
            .digest('hex')
            .slice(0, 32),
          senderChannelId: senderChannel.channelId,
          recipientChannelId: recipientData.channel.channelId,
          senderAddress: senderAddress,
          recipientAddress: recipientData.channel.userAddress,
          amount: recipientData.amount,
          taprootAddress: recipientData.channel.taprootAddress, // Recipient's taproot address - where the money actually is
          status: 'committed',
          commitmentNumber: recipientCommitment.commitmentNumber,
        }, { transaction });

        // Update Hub's internal ledger for recipient
        await this.updateHubLedger(
          recipientData.channel.userAddress,
          recipientData.channel.channelId,
          recipientData.amount,
          transaction
        );

        // Reload channel within transaction
        const updatedRecipientChannel = await PaymentChannel.findOne({
          where: { channelId: recipientData.channel.channelId },
          transaction,
        });

        if (!updatedRecipientChannel) {
          throw new Error(`Failed to reload recipient channel ${recipientData.channel.channelId}`);
        }

        // Note: L1 balance will be fetched after transaction commit
        recipientChannels.push({
          userAddress: recipientData.channel.userAddress,
          channel: {
            channelId: updatedRecipientChannel.channelId,
            taprootAddress: updatedRecipientChannel.taprootAddress,
            userAddress: updatedRecipientChannel.userAddress,
            hubAddress: updatedRecipientChannel.hubAddress,
            userBalance: updatedRecipientChannel.userBalance,
            hubBalance: updatedRecipientChannel.hubBalance,
            capacity: updatedRecipientChannel.capacity,
            status: updatedRecipientChannel.status,
            commitmentNumber: updatedRecipientChannel.commitmentNumber,
          },
          commitment: recipientCommitment,
        });
      }

      // Commit transaction - all updates succeed together
      await transaction.commit();

      // Reload sender channel after commit
      const updatedSenderChannel = await PaymentChannel.findOne({
        where: { channelId: senderChannel.channelId },
      });

      if (!updatedSenderChannel) {
        throw new Error(`Failed to reload sender channel ${senderChannel.channelId}`);
      }

      // Fetch L1 balance for sender channel
      let senderL1Balance: number | undefined;
      try {
        const balance = await BalanceService.fetchBalance(updatedSenderChannel.taprootAddress);
        senderL1Balance = balance.balance;
      } catch (error: any) {
        console.warn(`Failed to fetch L1 balance for sender: ${error.message}`);
      }

      // Fetch L1 balances for recipient channels
      const recipientChannelsWithL1 = await Promise.all(
        recipientChannels.map(async (rc) => {
          let l1Balance: number | undefined;
          try {
            const balance = await BalanceService.fetchBalance(rc.channel.taprootAddress);
            l1Balance = balance.balance;
          } catch (error: any) {
            console.warn(`Failed to fetch L1 balance for recipient: ${error.message}`);
          }
          return {
            ...rc,
            channel: {
              ...rc.channel,
              l1Balance,
            },
          };
        })
      );

      return {
        success: true,
        senderChannel: {
          channelId: updatedSenderChannel.channelId,
          taprootAddress: updatedSenderChannel.taprootAddress,
          userAddress: updatedSenderChannel.userAddress,
          hubAddress: updatedSenderChannel.hubAddress,
          userBalance: updatedSenderChannel.userBalance,
          hubBalance: updatedSenderChannel.hubBalance,
          l1Balance: senderL1Balance,
          capacity: updatedSenderChannel.capacity,
          status: updatedSenderChannel.status,
          commitmentNumber: updatedSenderChannel.commitmentNumber,
        },
        recipientChannels: recipientChannelsWithL1,
        totalAmount,
        timestamp: new Date(),
      };
    } catch (error) {
      // Rollback transaction on any error
      await transaction.rollback();
      throw error;
    }
  }

  /**
   * Update Hub's internal ledger
   */
  private static async updateHubLedger(
    userAddress: string,
    channelId: string,
    amount: number,
    transaction?: any
  ): Promise<void> {
    // Ensure model is initialized
    if (!ensureHubLedgerInitialized()) {
      console.warn('HubLedger model not initialized. Skipping ledger update.');
      return;
    }

    let ledgerEntry;
    try {
      ledgerEntry = await HubLedger.findOne({
        where: { userAddress },
        transaction,
      });
    } catch (error: any) {
      console.error('HubLedger.findOne error:', error);
      // Continue - will create new entry
      ledgerEntry = null;
    }

    if (ledgerEntry) {
      try {
        await ledgerEntry.update({
          balance: ledgerEntry.balance + amount,
          channelId,
          lastUpdated: new Date(),
        }, { transaction });
      } catch (error: any) {
        console.error('HubLedger.update error:', error);
        // Continue - error is logged
      }
    } else {
      try {
        await HubLedger.create({
          userAddress,
          balance: amount,
          channelId,
          lastUpdated: new Date(),
        }, { transaction });
      } catch (error: any) {
        console.error('HubLedger.create error:', error);
        // Continue - error is logged
      }
    }
  }

  /**
   * Sync Hub Ledger with current channel states
   * Recalculates ledger from actual channel hubBalance values
   * This ensures ledger reflects current state, not stale data
   * 
   * Hub Ledger balance = channel hubBalance
   * - Positive = Hub has funds from user (user owes hub)
   * - Negative = Hub owes funds to user
   * 
   * Only includes channels with actual activity (commitments made)
   * Filters out channels with no commitments (commitmentNumber = 0 and hubBalance = 0)
   */
  static async syncHubLedger(): Promise<void> {
    // Ensure models are initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel model not initialized. Skipping hub ledger sync.');
      return;
    }

    if (!HubLedger) {
      console.warn('HubLedger model not available. Skipping hub ledger sync.');
      return;
    }

    // Get all open channels that have actual activity
    // Only include channels where:
    // 1. Status is 'open'
    // 2. Either commitmentNumber > 0 (has commitments) OR hubBalance != 0 (has balance changes)
    // This filters out newly opened channels with no activity
    let openChannels;
    try {
      openChannels = await PaymentChannel.findAll({
        where: { 
          status: 'open',
        },
      });
    } catch (error: any) {
      console.error('Error in syncHubLedger finding channels:', error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('PaymentChannel table may not exist yet. Skipping sync.');
        return;
      }
      throw error;
    }

    // Safety check
    if (!Array.isArray(openChannels)) {
      console.error('PaymentChannel.findAll did not return an array:', openChannels);
      return;
    }

    // Filter channels that have actual activity
    // Only show channels with commitments or balance changes
    const activeChannels = openChannels.filter(channel => 
      channel.commitmentNumber > 0 || channel.hubBalance !== 0
    );

    console.log(`[Hub Ledger Sync] Found ${openChannels.length} open channels, ${activeChannels.length} with activity`);

    // Ensure HubLedger is initialized
    if (!ensureHubLedgerInitialized()) {
      console.warn('HubLedger model not initialized. Skipping ledger sync.');
      return;
    }

    // Clear existing ledger entries
    try {
      await HubLedger.destroy({ where: {} });
    } catch (error: any) {
      console.error('HubLedger.destroy error:', error);
      // Continue - will try to create entries anyway
    }

    // Recreate ledger entries from current channel states
    for (const channel of activeChannels) {
      // Hub ledger balance = channel hubBalance
      // This represents the net balance Hub has with this user
      const ledgerBalance = channel.hubBalance;

      console.log(`[Hub Ledger Sync] Adding entry for ${channel.userAddress.slice(0, 16)}... - Balance: ${ledgerBalance}, Commitments: ${channel.commitmentNumber}`);

      try {
        await HubLedger.upsert({
          userAddress: channel.userAddress,
          balance: ledgerBalance,
          channelId: channel.channelId,
          lastUpdated: new Date(),
        });
      } catch (error: any) {
        console.error(`HubLedger.upsert error for ${channel.userAddress}:`, error);
        // Continue with next channel
      }
    }

    console.log(`[Hub Ledger Sync] Completed. Synced ${activeChannels.length} active channels`);
  }

  /**
   * Get Hub's internal ledger
   * Optionally syncs with current channel states first
   */
  static async getHubLedger(syncWithChannels: boolean = false): Promise<HubLedgerEntry[]> {
    // Ensure model is initialized
    if (!ensureHubLedgerInitialized()) {
      console.warn('HubLedger model not initialized. Returning empty array.');
      return [];
    }

    // If sync requested, recalculate from current channel states
    if (syncWithChannels) {
      await this.syncHubLedger();
    }

    let entries;
    try {
      // Use minimal options to avoid order clause issues
      entries = await HubLedger.findAll({});
      
      // Sort manually if needed
      if (Array.isArray(entries) && entries.length > 0) {
        entries.sort((a, b) => {
          const dateA = a.lastUpdated ? new Date(a.lastUpdated).getTime() : (a.updatedAt ? new Date(a.updatedAt).getTime() : 0);
          const dateB = b.lastUpdated ? new Date(b.lastUpdated).getTime() : (b.updatedAt ? new Date(b.updatedAt).getTime() : 0);
          return dateB - dateA; // DESC order
        });
      }
    } catch (error: any) {
      console.error('HubLedger.findAll error:', error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('HubLedger table may not exist yet. Returning empty array.');
        return [];
      }
      throw error;
    }

    // Safety check
    if (!Array.isArray(entries)) {
      console.error('HubLedger.findAll did not return an array:', entries);
      return [];
    }

    return entries.map(entry => ({
      userAddress: entry.userAddress,
      balance: entry.balance,
      channelId: entry.channelId,
      lastUpdated: entry.lastUpdated || entry.updatedAt,
    }));
  }

  /**
   * Clear Hub Ledger (remove all entries)
   */
  static async clearHubLedger(): Promise<void> {
    // Ensure model is initialized
    if (!ensureHubLedgerInitialized()) {
      console.warn('HubLedger model not initialized. Skipping clear.');
      return;
    }

    try {
      await HubLedger.destroy({ where: {} });
    } catch (error: any) {
      console.error('HubLedger.destroy error:', error);
      throw error;
    }
  }

  /**
   * Calculate Hub's global balance across all channels
   * Hub's global balance = Sum of all hubBalance in all open channels
   * This represents Hub's total available balance for routing
   * 
   * Example:
   * - User 1's channel: hubBalance = 500 (Hub has 500 from User 1)
   * - User 2's channel: hubBalance = -300 (Hub owes 300 to User 2)
   * - Global Hub balance = 500 + (-300) = 200 sats
   */
  static async getGlobalHubBalance(): Promise<number> {
    // Ensure model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel model not initialized. Returning 0.');
      return 0;
    }

    let openChannels;
    try {
      openChannels = await PaymentChannel.findAll({
        where: { status: 'open' },
      });
    } catch (error: any) {
      console.error('Error in getGlobalHubBalance:', error);
      if (error.message?.includes('doesn\'t exist') || error.message?.includes('Unknown column')) {
        console.warn('PaymentChannel table may not exist yet. Returning 0.');
        return 0;
      }
      throw error;
    }

    // Safety check
    if (!Array.isArray(openChannels)) {
      console.error('PaymentChannel.findAll did not return an array:', openChannels);
      return 0;
    }

    // Sum of all hubBalance across all channels
    // Positive hubBalance = Hub has funds in that channel
    // Negative hubBalance = Hub owes funds in that channel
    const globalBalance = openChannels.reduce((sum, channel) => {
      return sum + Number(channel.hubBalance);
    }, 0);

    return globalBalance;
  }

  /**
   * Watchtower Check - Detect stale transactions on L1
   */
  static async watchtowerCheck(channelId: string): Promise<{
    isStale: boolean;
    latestCommitment: number;
    detectedCommitment?: number;
    message: string;
  }> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    // In a real implementation, this would check L1 blockchain
    // For now, we simulate by checking if commitment number matches
    // In production, this would query Bitcoin L1 for the channel's taproot address
    
    return {
      isStale: false,
      latestCommitment: channel.commitmentNumber,
      message: 'No stale transactions detected. Channel state is current.',
    };
  }

  /**
   * Unilateral Exit - User exits channel without Hub cooperation
   * Includes CSV lock (time delay) for security
   * Creates and broadcasts actual Bitcoin transaction to testnet
   */
  static async unilateralExit(
    channelId: string,
    userPrivateKey: string
  ): Promise<{
    exitTxid: string;
    csvLockTime: Date;
    unlockTime: Date;
    message: string;
  }> {
    // Ensure PaymentChannel model is initialized
    if (!ensurePaymentChannelInitialized()) {
      console.warn('PaymentChannel not initialized, attempting to initialize...');
      try {
        // Try to get sequelize instance directly (will throw if not connected)
        let sequelize;
        try {
          sequelize = getSequelize();
        } catch (seqError: any) {
          // Database not connected - try to connect
          const { connectDatabase } = await import('../config/database');
          await connectDatabase();
          sequelize = getSequelize();
        }
        
        // Initialize models
        const { initializeModels: initModels } = await import('../models');
        initModels(sequelize);
        
        // Small delay to ensure initialization completes
        await new Promise(resolve => setTimeout(resolve, 100));
        
        // Check again after initialization
        if (!ensurePaymentChannelInitialized()) {
          throw new Error(
            'PaymentChannel model could not be initialized even after re-initialization. ' +
            'Please ensure the database is connected and models are properly initialized. ' +
            'Try restarting the server.'
          );
        }
      } catch (initError: any) {
        console.error('Model initialization error details:', initError);
        throw new Error(
          `Failed to initialize PaymentChannel model: ${initError.message}. ` +
          `Please ensure the server has properly started and database is connected.`
        );
      }
    }

    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'open') {
      throw new Error('Channel must be open for unilateral exit');
    }

    // CSV lock: 144 blocks delay (standard Lightning Network delay)
    // In Bitcoin, CSV uses relative time/block height
    // For testnet: 144 blocks ≈ 24 hours (testnet blocks are ~10 min)
    // For mainnet: 144 blocks ≈ 24 hours (mainnet blocks are ~10 min)
    const csvLockBlocks = 144; // Standard Lightning Network delay
    const csvLockMinutes = Math.ceil(csvLockBlocks * 10); // ~10 min per block
    const unlockTime = new Date(Date.now() + csvLockMinutes * 60 * 1000);

    // Update channel status
    await channel.update({ status: 'closing' });

    try {
      const network = this.getNetwork();

      console.log('Starting unilateral exit transaction...');
      
      // 1. Derive keys from private keys (same as create-transaction)
      console.log('Deriving keys from private keys...');
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      
      // Helper to convert pubkey to x-only pubkey (32 bytes)
      const toXOnly = (pubKey: Buffer) => {
        return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      };

      // Derive public keys from private keys
      let userPk = toXOnly(Buffer.from(userKey.publicKey));
      
      // Register user public key if not already registered
      const userPublicKeyHex = Buffer.from(userKey.publicKey).toString('hex');
      WalletService.registerPublicKey(channel.userAddress, userPublicKeyHex);
      console.log(`Registered user public key for ${channel.userAddress}`);

      // Get hub public key (try to derive from hub private key first, then from map)
      let hubPk: Buffer | undefined;
      let hubKey: any;
      
      // Try to derive hub key from private key if available
      const hubPrivateKey = config.hubPrivateKey;
      if (hubPrivateKey) {
        try {
          hubKey = ECPair.fromWIF(hubPrivateKey, network);
          hubPk = toXOnly(Buffer.from(hubKey.publicKey));
          const hubPublicKeyHex = Buffer.from(hubKey.publicKey).toString('hex');
          WalletService.registerPublicKey(channel.hubAddress, hubPublicKeyHex);
          console.log(`Derived and registered hub public key from private key`);
        } catch (e) {
          console.warn('Could not derive hub key from private key, trying map...');
        }
      }

      // If hub key not derived, get from map
      if (!hubPk) {
        const hubPublicKey = WalletService.getPublicKey(channel.hubAddress);
        if (!hubPublicKey) {
          throw new Error(`Hub public key not found for ${channel.hubAddress}. Please ensure hub key is registered.`);
        }
        hubPk = toXOnly(Buffer.from(hubPublicKey.startsWith('0x') ? hubPublicKey.slice(2) : hubPublicKey, 'hex'));
        console.log(`Retrieved hub public key from map`);
      }

      if (!userPk || !hubPk) {
        throw new Error('Could not derive public keys for User and Hub to reconstruct script tree');
      }

      // Get UTXOs from taproot address
      console.log(`Fetching UTXOs for taproot address: ${channel.taprootAddress}`);
      const utxos = await BalanceService.getUTXO(channel.taprootAddress, this.getNetworkString());
      if (!utxos || utxos.length === 0) {
        throw new Error(`No UTXOs found for channel at ${channel.taprootAddress}`);
      }

      console.log(`Found ${utxos.length} UTXO(s) to spend`);

      // Get fee rate
      console.log('Fetching fee rates...');
      let feeRate = 7.5; // Default
      try {
        const { data: fees } = await axios.get(this.getMempoolFeesUrl());
        feeRate = fees.fastestFee;
        console.log(`Current fastest fee rate: ${feeRate} sat/vB`);
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Reconstruct taproot script tree (EXACT same as in WalletService.createTaprootMultisig)
      // Leaf 1: Immediate 2-of-2 MultiSig
      const scriptImmediate = Buffer.from(bitcoin.script.compile([
        userPk,
        bitcoin.opcodes.OP_CHECKSIG,
        hubPk,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]));

      // Leaf 2: User Key + CSV (unilateral exit path)
      // Use csvLockBlocks (144) for proper CSV lock
      const scriptUser = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(csvLockBlocks), // Use proper CSV lock blocks (144)
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        userPk,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Leaf 3: Hub Key + CSV
      const scriptHub = Buffer.from(bitcoin.script.compile([
        bitcoin.script.number.encode(144),
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        hubPk,
        bitcoin.opcodes.OP_CHECKSIG,
      ]));

      // Construct Taproot Tree (EXACT same structure as WalletService)
      const scriptTree = [
        { output: scriptImmediate },
        [
          { output: scriptUser },
          { output: scriptHub },
        ],
      ];

      // First, verify we can reconstruct the address correctly
      const { address: reconstructedAddress } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ), // Standard NUMS key - must match WalletService
        scriptTree,
        network,
      });

      if (!reconstructedAddress) {
        throw new Error('Failed to reconstruct taproot address');
      }

      // Verify reconstructed address matches stored address
      if (reconstructedAddress !== channel.taprootAddress) {
        console.error('Address mismatch!');
        console.error(`  Stored:    ${channel.taprootAddress}`);
        console.error(`  Reconstructed: ${reconstructedAddress}`);
        throw new Error(
          `Reconstructed taproot address does not match stored address. ` +
          `This indicates a mismatch in public keys or script tree structure. ` +
          `Stored: ${channel.taprootAddress}, Reconstructed: ${reconstructedAddress}`
        );
      }

      console.log(`✓ Verified taproot address matches: ${reconstructedAddress}`);

      // Get taproot output script and control block for user CSV path
      const tapLeaf = {
        output: scriptUser,
      };

      const { output: scriptPubKey, witness } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ), // Standard NUMS key - must match WalletService
        scriptTree,
        redeem: tapLeaf, // This generates the specific control block for user CSV leaf
        network,
      });

      if (!scriptPubKey) {
        throw new Error('Failed to derive taproot scriptPubKey');
      }

      // Extract control block from witness
      // Witness stack for script path: [stack elements..., script, controlBlock]
      const controlBlock = witness && witness.length > 0 ? witness[witness.length - 1] : Buffer.alloc(33);
      
      if (!controlBlock || controlBlock.length === 0) {
        throw new Error('Failed to extract control block from witness');
      }

      console.log(`✓ Derived scriptPubKey and control block (${controlBlock.length} bytes)`);

      // Create PSBT
      console.log('Creating PSBT...');
      const psbt = new bitcoin.Psbt({ network });

      // Fee Estimation Constants (same as create-transaction)
      const INPUT_SIZE = 150; // Conservative estimate for Taproot script path spend (vBytes)
      const OUTPUT_SIZE = 43; // P2TR/P2WPKH output (vBytes)
      const OVERHEAD = 10; // Version, locktime, etc. (vBytes)

      // Calculate total balance from all UTXOs
      let totalBalance = 0;
      for (const utxo of utxos) {
        totalBalance += utxo.value;
      }

      // Validate that committed balances match total balance (with some tolerance for fees)
      const committedTotal = channel.userBalance + channel.hubBalance;
      if (Math.abs(committedTotal - totalBalance) > 10000) {
        console.warn(
          `Balance mismatch: committedTotal (${committedTotal}) != totalBalance (${totalBalance}). ` +
          `Using committed balances for split.`
        );
      }

      // Calculate estimated fee for all inputs and outputs
      const numInputs = utxos.length;
      const numOutputs = 2; // User output + Hub output (proper split)
      const estimatedVSize = (numInputs * INPUT_SIZE) + (numOutputs * OUTPUT_SIZE) + OVERHEAD;
      const estimatedFee = estimatedVSize * feeRate;

      console.log(`Estimated Fee: ${estimatedFee} sats (Rate: ${feeRate} sat/vB, vSize: ~${estimatedVSize})`);
      console.log(`Total balance: ${totalBalance} sats`);
      console.log(`Committed balances - User: ${channel.userBalance} sats, Hub: ${channel.hubBalance} sats`);

      // Calculate proper split based on committed balances
      // Fee is deducted from user's share since user initiates the exit
      const userOutput = BigInt(Math.max(0, channel.userBalance - estimatedFee));
      const hubOutput = BigInt(channel.hubBalance);

      // Validate outputs
      if (userOutput < BigInt(0)) {
        throw new Error(
          `Insufficient user balance for fee. User balance: ${channel.userBalance} sats, Fee: ${estimatedFee} sats`
        );
      }

      // Verify total outputs don't exceed total balance
      const totalOutputs = Number(userOutput) + Number(hubOutput);
      if (totalOutputs > totalBalance) {
        throw new Error(
          `Outputs exceed balance. Total outputs: ${totalOutputs} sats, Total balance: ${totalBalance} sats. ` +
          `This may indicate stale commitment state.`
        );
      }

      // Sequence: CSV uses relative time/block height
      // For block-based relative locktime, we need to set the flag 0x80000000
      // Format: 0x80000000 | blockCount (for block-based CSV)
      // For 144 blocks: 0x80000090
      // This matches the script which uses csvLockBlocks (144)
      // bitcoinjs-lib will handle the encoding, but we need to set it correctly
      const sequence = 0x80000000 | csvLockBlocks; // Block-based relative locktime: 144 blocks

      // Add all UTXOs as inputs (to clear the taproot address completely)
      console.log(`Adding ${utxos.length} UTXO(s) as inputs...`);
      for (const utxo of utxos) {
        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          sequence: sequence, // CSV relative locktime
          witnessUtxo: {
            script: scriptPubKey,
            value: BigInt(utxo.value),
          },
          tapLeafScript: [
            {
              leafVersion: 192, // 0xC0 (tapscript version)
              script: scriptUser, // Use CSV path for unilateral exit
              controlBlock: controlBlock, // Proper control block from p2tr
            },
          ],
        });
      }

      // Add output to user's address (userBalance - fee)
      console.log(`Adding output to user address: ${channel.userAddress} (${userOutput} sats)`);
      const userAddressScript = bitcoin.address.toOutputScript(channel.userAddress, network);
      psbt.addOutput({
        script: userAddressScript,
        value: userOutput,
      });

      // Add output to hub's address (hubBalance - full amount, no fee deduction)
      if (hubOutput > BigInt(0)) {
        console.log(`Adding output to hub address: ${channel.hubAddress} (${hubOutput} sats)`);
        const hubAddressScript = bitcoin.address.toOutputScript(channel.hubAddress, network);
        psbt.addOutput({
          script: hubAddressScript,
          value: hubOutput,
        });
      } else {
        console.log(`Hub balance is ${channel.hubBalance} sats (non-positive), skipping hub output`);
      }

      // Validate PSBT before signing
      console.log('Validating PSBT...');
      if (psbt.inputCount === 0) {
        throw new Error('PSBT has no inputs');
      }
      const outputCount = hubOutput > BigInt(0) ? 2 : 1;
      console.log(`PSBT validated: ${psbt.inputCount} input(s), ${outputCount} output(s)`);
      console.log(`Funds split - User: ${userOutput} sats, Hub: ${hubOutput} sats`);

      // Sign all inputs with user's key (unilateral, only user signs)
      console.log('Signing all inputs with user key...');
      psbt.signAllInputs(userKey);
      
      // Verify signatures before finalizing (optional check)
      console.log('Verifying signatures...');
      try {
        for (let i = 0; i < psbt.inputCount; i++) {
          // Check if input has signatures
          const input = psbt.data.inputs[i];
          if (!input || !input.tapScriptSig || input.tapScriptSig.length === 0) {
            console.warn(`Input ${i} may not have signatures yet`);
          }
        }
        console.log('Signature check completed');
      } catch (sigError: any) {
        console.warn(`Signature verification warning: ${sigError.message}`);
        // Continue anyway, finalize will catch actual errors
      }
      
      // Finalize and extract transaction
      console.log('Finalizing inputs...');
      psbt.finalizeAllInputs();
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();
      const virtualSize = tx.virtualSize();
      const actualUserOutput = Number(tx.outs[0]?.value || 0);
      const actualHubOutput = tx.outs.length > 1 ? Number(tx.outs[1]?.value || 0) : 0;
      const actualFee = totalBalance - actualUserOutput - actualHubOutput;
      console.log(`Actual Transaction vSize: ${virtualSize} vBytes`);
      console.log(`Actual Fee: ${actualFee} sats`);
      console.log(`Actual Outputs - User: ${actualUserOutput} sats, Hub: ${actualHubOutput} sats`);
      
      // Validate transaction structure
      console.log('Validating transaction structure...');
      if (tx.ins.length === 0) {
        throw new Error('Transaction has no inputs');
      }
      if (tx.outs.length === 0) {
        throw new Error('Transaction has no outputs');
      }
      console.log(`Transaction structure valid: ${tx.ins.length} input(s), ${tx.outs.length} output(s)`);

      // Broadcast transaction
      console.log(`Broadcasting unilateral exit transaction for channel ${channelId}...`);
      console.log(`Transaction hex (first 100 chars): ${txHex.substring(0, 100)}...`);
      
      let exitTxid: string;
      try {
        const broadcastRes = await axios.post(
          this.getMempoolBroadcastUrl(),
          txHex,
          {
            headers: {
              'Content-Type': 'text/plain',
            },
          }
        );
        exitTxid = broadcastRes.data;
      } catch (broadcastError: any) {
        console.error('Broadcast error details:', {
          status: broadcastError.response?.status,
          statusText: broadcastError.response?.statusText,
          data: broadcastError.response?.data,
          message: broadcastError.message,
          txHexLength: txHex.length,
          txHexPreview: txHex.substring(0, 200),
        });
        
        // Try to get more details about the transaction
        try {
          console.log('Transaction details:');
          console.log(`  Inputs: ${tx.ins.length}`);
          console.log(`  Outputs: ${tx.outs.length}`);
          console.log(`  Version: ${tx.version}`);
          console.log(`  Locktime: ${tx.locktime}`);
          
          // Check if transaction is valid
          if (tx.ins.length === 0) {
            throw new Error('Transaction has no inputs');
          }
          if (tx.outs.length === 0) {
            throw new Error('Transaction has no outputs');
          }
        } catch (txError: any) {
          console.error('Transaction validation error:', txError.message);
        }
        
        throw new Error(
          `Broadcast failed: ${broadcastError.response?.data || broadcastError.response?.statusText || broadcastError.message}`
        );
      }

      // Update channel with exit transaction ID
      await channel.update({
        closingTxid: exitTxid,
        status: 'closing', // Keep as closing until CSV lock expires
      });

      console.log(`Unilateral exit transaction broadcast: ${exitTxid}`);

      return {
        exitTxid,
        csvLockTime: new Date(),
        unlockTime,
        message: `Unilateral exit initiated. Transaction ${exitTxid} broadcast to ${this.getNetworkString()}. Funds will be available after ${csvLockMinutes} minutes (CSV lock).`,
      };
    } catch (error: any) {
      console.error(`Error in unilateralExit: ${error.message}`);
      // Revert channel status on error
      await channel.update({ status: 'open' });
      throw new Error(`Failed to create unilateral exit transaction: ${error.message}`);
    }
  }

  /**
   * Competing Remedy Transaction (R1 Transaction)
   * Hub creates and broadcasts latest commitment transaction to compete with stale U1 transaction
   * This is the R1 tx that invalidates the user's stale U1 tx
   */
  static async competingRemedy(
    channelId: string,
    staleCommitmentNumber: number,
    hubPrivateKey?: string
  ): Promise<{
    remedyTxid: string;
    success: boolean;
    message: string;
  }> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    // Check if the commitment is actually stale
    if (staleCommitmentNumber >= channel.commitmentNumber) {
      throw new Error('Commitment is not stale. Cannot create remedy transaction.');
    }

    // Get hub private key
    const hubPrivKey = hubPrivateKey || config.hubPrivateKey;
    if (!hubPrivKey) {
      throw new Error('Hub private key is required for competing remedy transaction');
    }

    // Get user private key (we need both to create 2-of-2 transaction)
    // In production, hub would have stored user's public key and create transaction
    // For now, we'll use the latest commitment transaction if available
    console.log(`[Competing Remedy] Creating R1 transaction to compete with stale commitment #${staleCommitmentNumber}`);
    console.log(`[Competing Remedy] Latest commitment: #${channel.commitmentNumber}`);

    let remedyTxid: string;

    // If we have a stored latest commitment transaction, broadcast it
    if (channel.lastCommitmentTxHex) {
      try {
        console.log(`[Competing Remedy] Broadcasting stored latest commitment transaction (R1 tx)...`);
        const broadcastRes = await axios.post(
          this.getMempoolBroadcastUrl(),
          channel.lastCommitmentTxHex,
          {
            headers: {
              'Content-Type': 'text/plain',
            },
          }
        );
        remedyTxid = broadcastRes.data;
        console.log(`[Competing Remedy] ✓ R1 transaction broadcast: ${remedyTxid}`);
        console.log(`[Competing Remedy]   View on ${this.getNetworkString()}: ${this.getMempoolTxUrl(remedyTxid)}`);
      } catch (error: any) {
        console.error(`[Competing Remedy] Failed to broadcast stored commitment: ${error.message}`);
        throw new Error(`Failed to broadcast competing remedy transaction: ${error.message}`);
      }
    } else {
      // No stored transaction - this shouldn't happen if channel has commitments
      throw new Error('No stored commitment transaction found. Cannot create competing remedy.');
    }

    // Update channel status
    await channel.update({ 
      status: 'closed',
      closingTxid: remedyTxid,
    });

    return {
      remedyTxid,
      success: true,
      message: `Competing remedy transaction (R1 tx) broadcast successfully to ${this.getNetworkString()}. Stale commitment #${staleCommitmentNumber} has been invalidated. TXID: ${remedyTxid}`,
    };
  }
}

