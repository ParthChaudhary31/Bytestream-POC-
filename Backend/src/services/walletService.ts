import * as bitcoin from 'bitcoinjs-lib';
import { initEccLib } from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import { Buffer } from 'buffer';
import axios from 'axios';

// Initialize ECC library for bitcoinjs-lib
initEccLib(ecc);

const ECPair = ECPairFactory(ecc);
const bip32 = BIP32Factory(ecc);

// In-memory storage for address to publicKey mapping
const addressToPublicKeyMap = new Map<string, string>();

export interface Wallet {
  address: string;
  privateKey: string;
  publicKey?: string;
  mnemonic?: string;
  derivationPath?: string;
  network?: string;
}

export interface TaprootMultisig {
  address: string;
  scriptHex: string;
}

export class WalletService {
  /**
   * Generate a new Bitcoin wallet using mnemonic (BIP39) and BIP32 derivation
   */
  static generateWallet(): Wallet {
    try {
      const network = bitcoin.networks.testnet;

      // Generate mnemonic
      const mnemonic = bip39.generateMnemonic();

      // Convert mnemonic to seed
      const seed = bip39.mnemonicToSeedSync(mnemonic);

      // Create root from seed
      const root = bip32.fromSeed(seed, network);

      // Derive path m/44'/1'/0'/0/0 (Testnet P2PKH derivation path - coin type 1 for testnet)
      const path = "m/44'/1'/0'/0/0";
      const child = root.derivePath(path);

      // Generate address from derived public key
      const { address } = (bitcoin.payments.p2pkh as any)({
        pubkey: child.publicKey,
        network,
      });

      const walletAddress = address || '';
      const walletPublicKey = Buffer.from(child.publicKey).toString('hex');

      // Store address to publicKey mapping
      if (walletAddress) {
        addressToPublicKeyMap.set(walletAddress, walletPublicKey);
      }

      return {
        address: walletAddress,
        privateKey: child.toWIF(),
        publicKey: walletPublicKey,
        mnemonic,
        derivationPath: path,
        network: 'testnet3', // bitcoin.networks.testnet refers to testnet3 (compatible with testnet4 for addresses)
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }

  /**
   * Create a Taproot multisig address
   * Accepts either addresses or public keys
   */
  static createTaprootMultisig(address1: string, address2: string): TaprootMultisig {
    try {
      if (!address1 || !address2) {
        throw new Error('Both address1 and address2 are required');
      }

      // Look up public keys from addresses
      const pubkey1 = addressToPublicKeyMap.get(address1);
      const pubkey2 = addressToPublicKeyMap.get(address2);

      if (!pubkey1 || !pubkey2) {
        throw new Error(`Public key not found for one or both addresses. Address1: ${address1}, Address2: ${address2}`);
      }

      const network = bitcoin.networks.testnet;

      // Remove "0x" prefix if present
      const cleanPubkey1 = pubkey1.startsWith('0x') ? pubkey1.slice(2) : pubkey1;
      const cleanPubkey2 = pubkey2.startsWith('0x') ? pubkey2.slice(2) : pubkey2;

      // Helper to convert hex to x-only pubkey (32 bytes)
      const toXOnly = (hex: string) => {
        const buf = Buffer.from(hex, 'hex');
        return buf.length === 32 ? buf : buf.subarray(1, 33);
      };

      const pk1 = toXOnly(cleanPubkey1);
      const pk2 = toXOnly(cleanPubkey2);

      // Construct script: <144> OP_CHECKSEQUENCEVERIFY OP_DROP <pk1> OP_CHECKSIG <pk2> OP_CHECKSIGADD OP_2 OP_EQUAL
      const script = bitcoin.script.compile([
        bitcoin.script.number.encode(144), // 144 blocks
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      // Create Taproot address
      const tapLeaf = {
        output: script,
      };

      const { address } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ), // Standard NUMS key
        scriptTree: tapLeaf,
        network,
      });

      return {
        address: address || '',
        scriptHex: Buffer.from(script).toString('hex'),
      };
    } catch (error) {
      throw new Error(`Failed to create taproot multisig: ${error}`);
    }
  }

  /**
   * Create and broadcast a transaction
   */
  static async createAndBroadcastTransaction(
    userAddress: string,
    hubAddress: string,
    userPrivateKey: string,
    hubPrivateKey: string,
    multisigAddress: string,
    nonce?: number
  ): Promise<string> {
    try {
      const network = bitcoin.networks.testnet;

      // 1. Derive keys and reconstruct multisig script
      const userKey = ECPair.fromWIF(userPrivateKey, network);
      const hubKey = ECPair.fromWIF(hubPrivateKey, network);

      // Helper to convert pubkey to x-only pubkey (32 bytes)
      const toXOnly = (pubKey: Buffer) => {
        return pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
      };

      const pk1 = toXOnly(Buffer.from(userKey.publicKey));
      const pk2 = toXOnly(Buffer.from(hubKey.publicKey));

      // Construct script: <144> OP_CHECKSEQUENCEVERIFY OP_DROP <pk1> OP_CHECKSIG <pk2> OP_CHECKSIGADD OP_2 OP_EQUAL
      const script = bitcoin.script.compile([
        bitcoin.script.number.encode(144), // 144 blocks
        bitcoin.opcodes.OP_CHECKSEQUENCEVERIFY,
        bitcoin.opcodes.OP_DROP,
        pk1,
        bitcoin.opcodes.OP_CHECKSIG,
        pk2,
        bitcoin.opcodes.OP_CHECKSIGADD,
        bitcoin.opcodes.OP_2,
        bitcoin.opcodes.OP_EQUAL,
      ]);

      const tapLeaf = {
        output: script,
      };

      const { output: scriptPubKey } = (bitcoin.payments.p2tr as any)({
        internalPubkey: Buffer.from(
          '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
          'hex'
        ),
        scriptTree: tapLeaf,
        network,
      });

      // if (!multisigAddress) throw new Error('Failed to derive multisig address');

      // 2. Fetch UTXOs
      const { data: utxos } = await axios.get(
        `https://mempool.space/testnet/api/address/${multisigAddress}/utxo`
      );

      if (!utxos || utxos.length === 0) {
        throw new Error('No UTXOs found for the multisig address');
      }

      // 3. Create PSBT
      const psbt = new bitcoin.Psbt({ network });

      // Target amount + fee (estimation)
      const sendAmount = 10000; // 0.0001 BTC
      const fee = 1000; // 1000 sats fee
      let totalInput = 0;

      // Add inputs
      for (const utxo of utxos) {
        const txHex = await axios.get(
          `https://mempool.space/testnet/api/tx/${utxo.txid}/hex`
        );

        psbt.addInput({
          hash: utxo.txid,
          index: utxo.vout,
          witnessUtxo: {
            script: scriptPubKey!,
            value: BigInt(utxo.value),
          },
          tapLeafScript: [
            {
              leafVersion: 192,
              script: script,
              controlBlock: (bitcoin.payments.p2tr as any)({
                internalPubkey: Buffer.from(
                  '50929b74c1a04954b78b4b6035e97a5e078a5a0f28ec96d547bfee9ace803ac0',
                  'hex'
                ),
                scriptTree: tapLeaf,
                network,
              }).witness![utxo.vout === 0 ? 1 : 1], // Simplified control block retrieval - in real app need proper merkle proof
            },
          ],
          sequence: 144, // Must match OP_CHECKSEQUENCEVERIFY
        });

        totalInput += utxo.value;
        if (totalInput >= sendAmount + fee) break;
      }

      if (totalInput < sendAmount + fee) {
        throw new Error('Insufficient funds');
      }

      // 4. Add outputs
      psbt.addOutput({
        address: 'mieqF8AK1SLqYqH75t3Sp8oATzFN5jpt7L',
        value: BigInt(sendAmount),
      });

      // Change output
      const change = totalInput - sendAmount - fee;
      if (change > 546) { // Dust limit
        psbt.addOutput({
          address: multisigAddress,
          value: BigInt(change),
        });
      }

      // 5. Sign Input
      // We need to sign all inputs. For simplicity assuming 1 input or signing all added.
      // Since both keys are needed (2-of-2 due to OP_CHECKSIGADD OP_2 OP_EQUAL)

      // NOTE: The script is <144> CSV DROP <pk1> CHECKSIG <pk2> CHECKSIGADD 2 EQUAL
      // This means BOTH keys must sign.

      psbt.signAllInputs(userKey);
      psbt.signAllInputs(hubKey);

      psbt.finalizeAllInputs();

      // 6. Broadcast
      const tx = psbt.extractTransaction();
      const txHex = tx.toHex();

      const broadcastRes = await axios.post(
        'https://mempool.space/testnet/api/tx',
        txHex
      );

      return broadcastRes.data; // txid

    } catch (error) {
      console.error('Detailed error:', error);
      throw new Error(`Failed to create and broadcast transaction: ${error}`);
    }
  }
}
