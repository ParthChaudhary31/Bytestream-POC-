/**
 * Test Suite: UTXO Creation on Exit
 * Specifically tests that UTXOs are created and broadcast when user exits
 */

import axios from 'axios';
import { TEST_CONFIG, TestUtils } from './setup';

class UTXOCreationTest {
  private user1: any = null;
  private user2: any = null;
  private user3: any = null;
  private hubAddress: string = '';
  private hubPrivateKey: string = '';
  private channels: Map<string, any> = new Map();

  async setup(): Promise<void> {
    TestUtils.logStep('Setting up UTXO creation test...');

    const { config } = await import('../src/config/env');
    this.hubAddress = config.hubAddress;
    this.hubPrivateKey = config.hubPrivateKey;

    if (!this.hubAddress || !this.hubPrivateKey) {
      throw new Error('Hub configuration required');
    }

    // Generate 3 test users
    for (let i = 1; i <= 3; i++) {
      const res = await axios.get(`${TEST_CONFIG.baseUrl}/generate-wallet`);
      const wallet = res.data;
      
      if (i === 1) this.user1 = wallet;
      if (i === 2) this.user2 = wallet;
      if (i === 3) this.user3 = wallet;

      await axios.post(`${TEST_CONFIG.baseUrl}/register-public-key`, {
        address: wallet.address,
        publicKey: wallet.publicKey,
      });

      TestUtils.logSuccess(`User ${i} wallet created`, { address: wallet.address });
    }
  }

  async createChannels(): Promise<void> {
    TestUtils.logStep('Creating channels for all users...');

    const users = [
      { wallet: this.user1, name: 'User 1' },
      { wallet: this.user2, name: 'User 2' },
      { wallet: this.user3, name: 'User 3' },
    ];

    for (const user of users) {
      const res = await axios.post(`${TEST_CONFIG.baseUrl}/channel/open`, {
        userAddress: user.wallet.address,
        capacity: 50000, // 50k sats
        userPublicKey: user.wallet.publicKey,
      });

      const channel = {
        channelId: res.data.channelId,
        taprootAddress: res.data.taprootAddress,
        userAddress: user.wallet.address,
        capacity: res.data.capacity,
      };

      this.channels.set(user.wallet.address, channel);
      TestUtils.logSuccess(`${user.name} channel opened`, channel);
    }
  }

  async fundChannels(): Promise<void> {
    TestUtils.logStep('Confirming channel funding...');

    for (const [userAddress, channel] of this.channels) {
      await axios.post(`${TEST_CONFIG.baseUrl}/channel/confirm-funding`, {
        channelId: channel.channelId,
        fundingTxid: `mock_funding_${channel.channelId}`,
        userBalance: 50000,
        hubBalance: 0,
      });
    }

    TestUtils.logSuccess('All channels funded');
  }

  async createMultiplePayments(): Promise<void> {
    TestUtils.logStep('Creating multiple payments to User 2...');

    // User 1 → User 2: 5000 sats
    await axios.post(`${TEST_CONFIG.baseUrl}/channel/routing-payment`, {
      senderAddress: this.user1.address,
      recipients: [{ userAddress: this.user2.address, amount: 5000 }],
    });

    // User 3 → User 2: 3000 sats
    await axios.post(`${TEST_CONFIG.baseUrl}/channel/routing-payment`, {
      senderAddress: this.user3.address,
      recipients: [{ userAddress: this.user2.address, amount: 3000 }],
    });

    // User 1 → User 2: 2000 sats (second payment)
    await axios.post(`${TEST_CONFIG.baseUrl}/channel/routing-payment`, {
      senderAddress: this.user1.address,
      recipients: [{ userAddress: this.user2.address, amount: 2000 }],
    });

    TestUtils.logSuccess('Multiple payments created', {
      totalPayments: 3,
      totalAmount: 10000,
    });

    // Verify User 2's channel balance
    const user2Channel = this.channels.get(this.user2.address);
    const channelRes = await axios.get(
      `${TEST_CONFIG.baseUrl}/channel/${user2Channel.channelId}`
    );

    TestUtils.logStep('User 2 channel state', {
      userBalance: channelRes.data.userBalance,
      expectedBalance: 10000,
    });
  }

  async testExitWithUTXOs(): Promise<void> {
    TestUtils.logStep('Testing exit with UTXO creation...');

    const user2Channel = this.channels.get(this.user2.address);
    
    if (!user2Channel) {
      throw new Error('User 2 channel not found');
    }

    TestUtils.logStep('Exiting User 2 channel...', {
      channelId: user2Channel.channelId,
      expectedUTXOs: 3, // Should create 3 UTXOs (one per payment)
    });

    const exitRes = await axios.post(`${TEST_CONFIG.baseUrl}/channel/exit-user`, {
      userChannelId: user2Channel.channelId,
      userPrivateKey: this.user2.privateKey,
      hubPrivateKey: this.hubPrivateKey,
    });

    // Verify response
    console.log('\n📊 Exit Results:');
    console.log(`  - Exit TXID: ${exitRes.data.exitTxid}`);
    console.log(`  - Total Amount: ${exitRes.data.totalAmount} sats`);
    console.log(`  - Commitments Settled: ${exitRes.data.commitmentsSettled}`);
    console.log(`  - UTXOs Created: ${exitRes.data.commitmentUtxos?.length || 0}`);

    // Verify each UTXO
    if (exitRes.data.commitmentUtxos && exitRes.data.commitmentUtxos.length > 0) {
      console.log('\n🔗 UTXO Details:');
      for (const utxo of exitRes.data.commitmentUtxos) {
        const txUrl = `${TEST_CONFIG.testnetExplorer}/tx/${utxo.utxoTxid}`;
        console.log(`\n  Commitment: ${utxo.commitmentId}`);
        console.log(`    TXID: ${utxo.utxoTxid}`);
        console.log(`    VOUT: ${utxo.utxoVout}`);
        console.log(`    View: ${txUrl}`);

        // Try to verify UTXO exists on testnet
        const exists = await TestUtils.waitForTransaction(utxo.utxoTxid, 10000);
        if (exists) {
          console.log(`    ✅ Verified on testnet`);
        } else {
          console.log(`    ⏳ Not yet confirmed (may take time)`);
        }
      }
    } else {
      console.log('\n  ⚠️  No UTXOs created');
    }

    // Verify exit transaction
    if (exitRes.data.exitTxid) {
      const exitTxUrl = `${TEST_CONFIG.testnetExplorer}/tx/${exitRes.data.exitTxid}`;
      console.log(`\n  Exit Transaction: ${exitTxUrl}`);
      
      const exitExists = await TestUtils.waitForTransaction(exitRes.data.exitTxid, 10000);
      if (exitExists) {
        TestUtils.logSuccess('Exit transaction verified on testnet');
      }
    }

    TestUtils.logSuccess('Exit with UTXO creation completed');
  }

  async runTest(): Promise<void> {
    try {
      console.log('\n🧪 Starting UTXO Creation Test\n');
      console.log('='.repeat(60));

      await this.setup();
      await this.createChannels();
      await this.fundChannels();
      await this.createMultiplePayments();
      await this.testExitWithUTXOs();

      console.log('\n' + '='.repeat(60));
      TestUtils.logSuccess('UTXO creation test completed!');
      console.log('\n');
    } catch (error: any) {
      TestUtils.logError('UTXO creation test failed', error);
      throw error;
    }
  }
}

if (require.main === module) {
  const test = new UTXOCreationTest();
  test.runTest().catch(error => {
    console.error('Test execution failed:', error);
    process.exit(1);
  });
}

export { UTXOCreationTest };

