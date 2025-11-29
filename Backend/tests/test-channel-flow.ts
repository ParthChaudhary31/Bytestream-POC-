/**
 * Test Suite: Complete Bytestream Channel Flow
 * Tests the full lifecycle: channel opening, payments, and exit with UTXO creation
 */

import axios from 'axios';
import { TEST_CONFIG, TestUtils } from './setup';

interface TestWallet {
  address: string;
  privateKey: string;
  publicKey: string;
}

interface TestChannel {
  channelId: string;
  taprootAddress: string;
  userAddress: string;
  capacity: number;
}

class ChannelFlowTest {
  private user1: TestWallet | null = null;
  private user2: TestWallet | null = null;
  private hubAddress: string = '';
  private hubPrivateKey: string = '';
  private user1Channel: TestChannel | null = null;
  private user2Channel: TestChannel | null = null;

  async setup(): Promise<void> {
    TestUtils.logStep('Setting up test environment...');

    // Get Hub configuration from environment
    const { config } = await import('../src/config/env');
    this.hubAddress = config.hubAddress;
    this.hubPrivateKey = config.hubPrivateKey;

    if (!this.hubAddress || !this.hubPrivateKey) {
      throw new Error('Hub address and private key must be configured in environment variables');
    }

    // Generate test wallets
    TestUtils.logStep('Generating test wallets...');
    const user1Res = await axios.get(`${TEST_CONFIG.baseUrl}/generate-wallet`);
    this.user1 = user1Res.data;
    TestUtils.logSuccess('User 1 wallet generated', { address: this.user1.address });

    const user2Res = await axios.get(`${TEST_CONFIG.baseUrl}/generate-wallet`);
    this.user2 = user2Res.data;
    TestUtils.logSuccess('User 2 wallet generated', { address: this.user2.address });

    // Register public keys
    await axios.post(`${TEST_CONFIG.baseUrl}/register-public-key`, {
      address: this.user1.address,
      publicKey: this.user1.publicKey,
    });

    await axios.post(`${TEST_CONFIG.baseUrl}/register-public-key`, {
      address: this.user2.address,
      publicKey: this.user2.publicKey,
    });

    await axios.post(`${TEST_CONFIG.baseUrl}/register-public-key`, {
      address: this.hubAddress,
      publicKey: '', // Will be derived from private key
    });
  }

  async testChannelOpening(): Promise<void> {
    TestUtils.logStep('Testing channel opening...');

    if (!this.user1 || !this.user2) {
      throw new Error('Wallets not initialized');
    }

    // Open channel for User 1
    const user1ChannelRes = await axios.post(`${TEST_CONFIG.baseUrl}/channel/open`, {
      userAddress: this.user1.address,
      capacity: 100000, // 100k sats
      userPublicKey: this.user1.publicKey,
    });

    this.user1Channel = {
      channelId: user1ChannelRes.data.channelId,
      taprootAddress: user1ChannelRes.data.taprootAddress,
      userAddress: this.user1.address,
      capacity: user1ChannelRes.data.capacity,
    };

    TestUtils.logSuccess('User 1 channel opened', this.user1Channel);

    // Open channel for User 2
    const user2ChannelRes = await axios.post(`${TEST_CONFIG.baseUrl}/channel/open`, {
      userAddress: this.user2.address,
      capacity: 100000, // 100k sats
      userPublicKey: this.user2.publicKey,
    });

    this.user2Channel = {
      channelId: user2ChannelRes.data.channelId,
      taprootAddress: user2ChannelRes.data.taprootAddress,
      userAddress: this.user2.address,
      capacity: user2ChannelRes.data.capacity,
    };

    TestUtils.logSuccess('User 2 channel opened', this.user2Channel);
  }

  async testChannelFunding(): Promise<void> {
    TestUtils.logStep('Testing channel funding (simulated)...');

    if (!this.user1Channel || !this.user2Channel || !this.user1 || !this.user2) {
      throw new Error('Channels not initialized');
    }

    // Simulate funding - in real test, you would send actual testnet BTC
    // For now, we'll just confirm the funding with mock data
    const fundingTxid1 = 'mock_funding_txid_1';
    const fundingTxid2 = 'mock_funding_txid_2';

    // Confirm funding for User 1
    const confirm1Res = await axios.post(`${TEST_CONFIG.baseUrl}/channel/confirm-funding`, {
      channelId: this.user1Channel.channelId,
      fundingTxid: fundingTxid1,
      userBalance: 100000,
      hubBalance: 0,
    });

    TestUtils.logSuccess('User 1 channel funding confirmed', confirm1Res.data);

    // Confirm funding for User 2
    const confirm2Res = await axios.post(`${TEST_CONFIG.baseUrl}/channel/confirm-funding`, {
      channelId: this.user2Channel.channelId,
      fundingTxid: fundingTxid2,
      userBalance: 100000,
      hubBalance: 0,
    });

    TestUtils.logSuccess('User 2 channel funding confirmed', confirm2Res.data);
  }

  async testPaymentRouting(): Promise<void> {
    TestUtils.logStep('Testing payment routing...');

    if (!this.user1Channel || !this.user2Channel || !this.user1 || !this.user2) {
      throw new Error('Channels not initialized');
    }

    // User 1 sends payment to User 2 through Hub
    const paymentAmount = 5000; // 5k sats

    const routingRes = await axios.post(`${TEST_CONFIG.baseUrl}/channel/routing-payment`, {
      senderAddress: this.user1.address,
      recipients: [
        {
          userAddress: this.user2.address,
          amount: paymentAmount,
        },
      ],
    });

    TestUtils.logSuccess('Payment routed successfully', {
      senderChannel: routingRes.data.senderChannel,
      recipientChannels: routingRes.data.recipientChannels,
      totalAmount: routingRes.data.totalAmount,
    });

    // Verify channel states
    const user1ChannelRes = await axios.get(
      `${TEST_CONFIG.baseUrl}/channel/${this.user1Channel.channelId}`
    );
    const user2ChannelRes = await axios.get(
      `${TEST_CONFIG.baseUrl}/channel/${this.user2Channel.channelId}`
    );

    TestUtils.logStep('Channel states after payment', {
      user1: {
        userBalance: user1ChannelRes.data.userBalance,
        hubBalance: user1ChannelRes.data.hubBalance,
      },
      user2: {
        userBalance: user2ChannelRes.data.userBalance,
        hubBalance: user2ChannelRes.data.hubBalance,
      },
    });
  }

  async testExitWithUTXOCreation(): Promise<void> {
    TestUtils.logStep('Testing user exit with UTXO creation...');

    if (!this.user2Channel || !this.user2) {
      throw new Error('User 2 channel not initialized');
    }

    // Exit User 2's channel - this should create UTXOs for all commitments
    const exitRes = await axios.post(`${TEST_CONFIG.baseUrl}/channel/exit-user`, {
      userChannelId: this.user2Channel.channelId,
      userPrivateKey: this.user2.privateKey,
      hubPrivateKey: this.hubPrivateKey,
    });

    TestUtils.logSuccess('User exit completed', {
      exitTxid: exitRes.data.exitTxid,
      totalAmount: exitRes.data.totalAmount,
      commitmentsSettled: exitRes.data.commitmentsSettled,
      commitmentUtxos: exitRes.data.commitmentUtxos,
    });

    // Verify UTXOs were created
    if (exitRes.data.commitmentUtxos && exitRes.data.commitmentUtxos.length > 0) {
      TestUtils.logStep('Verifying UTXOs on testnet...');
      for (const utxo of exitRes.data.commitmentUtxos) {
        const txUrl = `${TEST_CONFIG.testnetExplorer}/tx/${utxo.utxoTxid}`;
        console.log(`  ✓ UTXO ${utxo.commitmentId}: ${txUrl}`);
        console.log(`    - TXID: ${utxo.utxoTxid}`);
        console.log(`    - VOUT: ${utxo.utxoVout}`);
      }
    } else {
      console.log('  ⚠️  No UTXOs created (no commitments found)');
    }

    // Wait a bit for transaction to propagate
    await TestUtils.wait(3000);

    // Verify exit transaction on testnet
    if (exitRes.data.exitTxid) {
      const txUrl = `${TEST_CONFIG.testnetExplorer}/tx/${exitRes.data.exitTxid}`;
      console.log(`\n  Exit Transaction: ${txUrl}`);
      
      // Try to verify transaction exists
      const txExists = await TestUtils.waitForTransaction(exitRes.data.exitTxid, 10000);
      if (txExists) {
        TestUtils.logSuccess('Exit transaction confirmed on testnet');
      } else {
        console.log('  ⚠️  Exit transaction not yet confirmed (may take time)');
      }
    }
  }

  async runFullTest(): Promise<void> {
    try {
      console.log('\n🚀 Starting Bytestream Channel Flow Test\n');
      console.log('='.repeat(60));

      await this.setup();
      await this.testChannelOpening();
      await this.testChannelFunding();
      await this.testPaymentRouting();
      await this.testExitWithUTXOCreation();

      console.log('\n' + '='.repeat(60));
      TestUtils.logSuccess('All tests completed successfully!');
      console.log('\n');
    } catch (error: any) {
      TestUtils.logError('Test failed', error);
      throw error;
    }
  }
}

// Run tests if executed directly
if (require.main === module) {
  const test = new ChannelFlowTest();
  test.runFullTest().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { ChannelFlowTest };

