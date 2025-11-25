import { PaymentChannel } from '../models';
import { WalletService } from './walletService';
import crypto from 'crypto';

export interface ChannelState {
  channelId: string;
  taprootAddress: string;
  userAddress: string;
  hubAddress: string;
  userBalance: number;
  hubBalance: number;
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
   * Open a new payment channel (Lightning style)
   * Step 1: Create taproot address for funding
   * Step 2: User funds the channel (L1 transaction)
   */
  static async openChannel(
    userAddress: string,
    hubAddress: string,
    capacity: number
  ): Promise<ChannelState> {
    // Create taproot multisig address for channel funding
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
   * Each payment creates a new commitment transaction (not broadcast)
   */
  static async updateChannelState(
    channelId: string,
    newUserBalance: number,
    newHubBalance: number
  ): Promise<CommitmentTransaction> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      throw new Error('Channel not found');
    }

    if (channel.status !== 'open') {
      throw new Error(`Channel is not open. Current status: ${channel.status}`);
    }

    // Validate balances
    if (newUserBalance < 0 || newHubBalance < 0) {
      throw new Error('Balances cannot be negative');
    }

    if (newUserBalance + newHubBalance !== channel.userBalance + channel.hubBalance) {
      throw new Error('Total balance must remain constant (no new funds added)');
    }

    // Create new commitment
    const commitmentNumber = channel.commitmentNumber + 1;
    const commitmentData = {
      channelId,
      commitmentNumber,
      userBalance: newUserBalance,
      hubBalance: newHubBalance,
      timestamp: new Date(),
    };

    // Generate commitment hash (simulating signed commitment transaction)
    const commitmentHash = crypto
      .createHash('sha256')
      .update(JSON.stringify(commitmentData))
      .digest('hex');

    // Update channel state
    await channel.update({
      userBalance: newUserBalance,
      hubBalance: newHubBalance,
      commitmentNumber,
      lastCommitmentHash: commitmentHash,
    });

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

    // Create settlement transaction (broadcast latest commitment to L1)
    // This simulates broadcasting the latest commitment transaction
    const closingTxid = await WalletService.createAndBroadcastTransaction(
      channel.userAddress,
      channel.hubAddress,
      userPrivateKey,
      hubPrivateKey,
      undefined, // nonce
      channel.taprootAddress,
      undefined, // broadcastPayload
      channel.taprootAddress // multisigAddress
    );

    // Update channel to closed
    await channel.update({
      status: 'closed',
      closingTxid,
    });

    return {
      closingTxid,
      channelState: {
        channelId: channel.channelId,
        taprootAddress: channel.taprootAddress,
        userAddress: channel.userAddress,
        hubAddress: channel.hubAddress,
        userBalance: channel.userBalance,
        hubBalance: channel.hubBalance,
        capacity: channel.capacity,
        status: 'closed',
        commitmentNumber: channel.commitmentNumber,
        closingTxid,
      },
    };
  }

  /**
   * Get channel by ID
   */
  static async getChannel(channelId: string): Promise<ChannelState | null> {
    const channel = await PaymentChannel.findOne({ where: { channelId } });
    
    if (!channel) {
      return null;
    }

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
      closingTxid: channel.closingTxid || undefined,
    };
  }

  /**
   * Get all channels for a user
   */
  static async getUserChannels(userAddress: string): Promise<ChannelState[]> {
    const channels = await PaymentChannel.findAll({
      where: { userAddress },
      order: [['createdAt', 'DESC']],
    });

    return channels.map(channel => ({
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
      closingTxid: channel.closingTxid || undefined,
    }));
  }

  /**
   * Get all open channels
   */
  static async getOpenChannels(): Promise<ChannelState[]> {
    const channels = await PaymentChannel.findAll({
      where: { status: 'open' },
      order: [['createdAt', 'DESC']],
    });

    return channels.map(channel => ({
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
      closingTxid: channel.closingTxid || undefined,
    }));
  }
}

