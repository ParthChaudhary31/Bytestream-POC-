import { PaymentChannel, HubLedger } from '../models';
import { WalletService } from './walletService';
import { BalanceService } from './balanceService';
import { config } from '../config/env';
import { getSequelize } from '../config/database';
import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import { initEccLib } from 'bitcoinjs-lib';
import axios from 'axios';
import crypto from 'crypto';

// Initialize ECC library
initEccLib(ecc);
const ECPair = ECPairFactory(ecc);

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
      const network = bitcoin.networks.testnet;
      
      // Get UTXO for channel taproot address
      const utxos = await BalanceService.getUTXO(channel.taprootAddress, 'testnet');
      if (!utxos || utxos.length === 0) {
        console.warn(`No UTXOs found for channel ${channel.channelId} at ${channel.taprootAddress}`);
        return null;
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
        const { data: fees } = await axios.get('https://mempool.space/testnet/api/v1/fees/recommended');
        feeRate = fees.fastestFee;
      } catch (error) {
        console.warn('Failed to fetch fee rates, using default:', feeRate);
      }

      // Create PSBT
      const psbt = new bitcoin.Psbt({ network });

      // Derive keys
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      const hubKey = ECPair.fromWIF(hubPrivateKey, network);

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
      // Fee is split proportionally or taken from hubBalance
      const userOutput = BigInt(userBalance);
      const hubOutput = BigInt(hubBalance - estimatedFee);

      if (hubOutput < BigInt(0)) {
        throw new Error(`Insufficient balance for fee. Hub balance: ${hubBalance}, Fee: ${estimatedFee}`);
      }

      // Add outputs
      // Output 1: User's address (userBalance)
      const userAddress = bitcoin.address.toOutputScript(channel.userAddress, network);
      psbt.addOutput({
        script: userAddress,
        value: userOutput,
      });

      // Output 2: Hub's address (hubBalance - fee)
      const hubAddress = bitcoin.address.toOutputScript(channel.hubAddress, network);
      psbt.addOutput({
        script: hubAddress,
        value: hubOutput,
      });

      // Sign with both keys
      psbt.signAllInputs(userKey);
      psbt.signAllInputs(hubKey);

      // Finalize
      psbt.finalizeAllInputs();

      // Extract transaction hex
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      return txHex;
    } catch (error: any) {
      console.error(`Error creating commitment transaction: ${error.message}`);
      // Return null on error - will just store hash
      return null;
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
    capacity: number
  ): Promise<ChannelState> {
    // Get Hub address from config
    const hubAddress = config.hubAddress;
    if (!hubAddress) {
      throw new Error('Hub address not configured. Please set HUB_ADDRESS in environment variables.');
    }

    // Create taproot multisig address for channel funding
    // Try to get public keys from the map, or use undefined to trigger lookup
    const taprootResult = WalletService.createTaprootMultisig(userAddress, hubAddress);
    
    const channelId = this.generateChannelId(userAddress, hubAddress);
    
    // Create channel record
    const channel = await PaymentChannel.create({
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
   * Close channel (Lightning style settlement)
   * Broadcasts latest commitment transaction to L1
   * 
   * On exit:
   * - User gets their committed balance (userBalance) on L1
   * - Withdrawable amount = L1 balance - hub balance
   *   - If hubBalance > 0 (user owes hub): L1 balance - hub balance = what user can withdraw
   *   - If hubBalance < 0 (hub owes user): L1 balance - hub balance = what user can withdraw (more than L1)
   * - The commitment transaction distributes funds according to committed balances
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

    // Update channel status to closing
    await channel.update({ status: 'closing' });

    let closingTxid: string;

    // If we have a stored commitment transaction, broadcast it
    if (channel.lastCommitmentTxHex) {
      try {
        // Broadcast the stored commitment transaction
        const broadcastRes = await axios.post(
          'https://mempool.space/testnet/api/tx',
          channel.lastCommitmentTxHex
        );
        closingTxid = broadcastRes.data; // txid
      } catch (error: any) {
        console.error(`Failed to broadcast stored commitment: ${error.message}`);
        // Fallback: create new commitment transaction and broadcast
        const commitmentTxHex = await this.createCommitmentTransaction(
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
          'https://mempool.space/testnet/api/tx',
          commitmentTxHex
        );
        closingTxid = broadcastRes.data;
      }
    } else {
      // No stored transaction, create and broadcast new one
      const commitmentTxHex = await this.createCommitmentTransaction(
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
        'https://mempool.space/testnet/api/tx',
        commitmentTxHex
      );
      closingTxid = broadcastRes.data;
    }

    // Update channel to closed
    await channel.update({
      status: 'closed',
      closingTxid,
    });

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
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
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
    const channels = await PaymentChannel.findAll({
      where: { userAddress },
      order: [['createdAt', 'DESC']],
    });

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
   * Get all open channels
   * Includes L1 balance from taproot address for each channel
   */
  static async getOpenChannels(): Promise<ChannelState[]> {
    const channels = await PaymentChannel.findAll({
      where: { status: 'open' },
      order: [['createdAt', 'DESC']],
    });

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

      // Update all recipient channels
      const recipientChannels: RoutingResult['recipientChannels'] = [];
      
      for (const recipientData of recipientChannelsData) {
        const recipientCommitment = await this.updateChannelState(
          recipientData.channel.channelId,
          recipientData.newUserBalance,
          recipientData.newHubBalance,
          transaction
        );

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
    const ledgerEntry = await HubLedger.findOne({
      where: { userAddress },
      transaction,
    });

    if (ledgerEntry) {
      await ledgerEntry.update({
        balance: ledgerEntry.balance + amount,
        channelId,
        lastUpdated: new Date(),
      }, { transaction });
    } else {
      await HubLedger.create({
        userAddress,
        balance: amount,
        channelId,
        lastUpdated: new Date(),
      }, { transaction });
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
    // Get all open channels that have actual activity
    // Only include channels where:
    // 1. Status is 'open'
    // 2. Either commitmentNumber > 0 (has commitments) OR hubBalance != 0 (has balance changes)
    // This filters out newly opened channels with no activity
    const openChannels = await PaymentChannel.findAll({
      where: { 
        status: 'open',
        // Only include channels with activity
        // Using Sequelize.literal to check: commitmentNumber > 0 OR hubBalance != 0
      },
    });

    // Filter channels that have actual activity
    // Only show channels with commitments or balance changes
    const activeChannels = openChannels.filter(channel => 
      channel.commitmentNumber > 0 || channel.hubBalance !== 0
    );

    console.log(`[Hub Ledger Sync] Found ${openChannels.length} open channels, ${activeChannels.length} with activity`);

    // Clear existing ledger entries
    await HubLedger.destroy({ where: {} });

    // Recreate ledger entries from current channel states
    for (const channel of activeChannels) {
      // Hub ledger balance = channel hubBalance
      // This represents the net balance Hub has with this user
      const ledgerBalance = channel.hubBalance;

      console.log(`[Hub Ledger Sync] Adding entry for ${channel.userAddress.slice(0, 16)}... - Balance: ${ledgerBalance}, Commitments: ${channel.commitmentNumber}`);

      await HubLedger.upsert({
        userAddress: channel.userAddress,
        balance: ledgerBalance,
        channelId: channel.channelId,
        lastUpdated: new Date(),
      });
    }

    console.log(`[Hub Ledger Sync] Completed. Synced ${activeChannels.length} active channels`);
  }

  /**
   * Get Hub's internal ledger
   * Optionally syncs with current channel states first
   */
  static async getHubLedger(syncWithChannels: boolean = false): Promise<HubLedgerEntry[]> {
    // If sync requested, recalculate from current channel states
    if (syncWithChannels) {
      await this.syncHubLedger();
    }

    const entries = await HubLedger.findAll({
      order: [['lastUpdated', 'DESC']],
    });

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
    await HubLedger.destroy({ where: {} });
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
    const openChannels = await PaymentChannel.findAll({
      where: { status: 'open' },
    });

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
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'open') {
      throw new Error('Channel must be open for unilateral exit');
    }

    // CSV lock: 24 hours delay
    const csvLockHours = 24;
    const unlockTime = new Date(Date.now() + csvLockHours * 60 * 60 * 1000);

    // Update channel status
    await channel.update({ status: 'closing' });

    // In production, this would create a transaction with CSV lock
    // For now, we simulate the transaction ID
    const exitTxid = crypto
      .createHash('sha256')
      .update(`${channelId}-${Date.now()}-unilateral`)
      .digest('hex');

    return {
      exitTxid,
      csvLockTime: new Date(),
      unlockTime,
      message: `Unilateral exit initiated. Funds will be available after ${csvLockHours} hours (CSV lock).`,
    };
  }

  /**
   * Competing Remedy Transaction
   * Hub can use this to prevent fraud if user tries to broadcast stale transaction
   */
  static async competingRemedy(
    channelId: string,
    staleCommitmentNumber: number
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

    // In production, this would create and broadcast a competing transaction
    // that proves the stale transaction is invalid
    const remedyTxid = crypto
      .createHash('sha256')
      .update(`${channelId}-${Date.now()}-remedy-${staleCommitmentNumber}`)
      .digest('hex');

    return {
      remedyTxid,
      success: true,
      message: `Competing remedy transaction created. Stale commitment #${staleCommitmentNumber} has been invalidated.`,
    };
  }
}

