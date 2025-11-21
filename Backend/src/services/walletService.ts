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

export interface Wallet {
  address: string;
  privateKey: string;
  publicKey?: string;
  mnemonic?: string;
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
      const network = bitcoin.networks.bitcoin;
      
      // Generate mnemonic
      const mnemonic = bip39.generateMnemonic();
      
      // Convert mnemonic to seed
      const seed = bip39.mnemonicToSeedSync(mnemonic);
      
      // Create root from seed
      const root = bip32.fromSeed(seed);
      
      // Derive path m/44'/0'/0'/0/0 (Standard P2PKH derivation path)
      const path = "m/44'/0'/0'/0/0";
      const child = root.derivePath(path);
      
      // Generate address from derived public key
      const { address } = (bitcoin.payments.p2pkh as any)({
        pubkey: child.publicKey,
        network,
      });

      return {
        address: address || '',
        privateKey: child.toWIF(),
        publicKey: Buffer.from(child.publicKey).toString('hex'),
        mnemonic,
      };
    } catch (error) {
      throw new Error(`Failed to generate wallet: ${error}`);
    }
  }

  /**
   * Create a Taproot multisig address
   */
  static createTaprootMultisig(pubkey1: string, pubkey2: string): TaprootMultisig {
    try {
      if (!pubkey1 || !pubkey2) {
        throw new Error('Both pubkey1 and pubkey2 are required');
      }

      const network = bitcoin.networks.bitcoin;

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

