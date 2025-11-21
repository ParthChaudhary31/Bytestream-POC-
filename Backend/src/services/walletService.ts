import * as bitcoin from 'bitcoinjs-lib';
import { initEccLib } from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';
import * as bip39 from 'bip39';
import BIP32Factory from 'bip32';
import { Buffer } from 'buffer';

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
}

