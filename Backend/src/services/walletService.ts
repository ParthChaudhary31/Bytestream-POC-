import * as bitcoin from 'bitcoinjs-lib';
import { ECPairFactory } from 'ecpair';
import * as ecc from 'tiny-secp256k1';

const ECPair = ECPairFactory(ecc);

export interface Wallet {
  address: string;
  privateKey: string;
  publicKey?: string;
}

export interface TaprootMultisig {
  address: string;
  scriptHex: string;
}

export class WalletService {
  /**
   * Generate a new Bitcoin wallet
   */
  static generateWallet(): Wallet {
    try {
      const network = bitcoin.networks.bitcoin;
      const keyPair = (ECPair as any).makeRandom({ network });
      const { address } = (bitcoin.payments.p2pkh as any)({
        pubkey: keyPair.publicKey,
        network,
      });

      return {
        address: address || '',
        privateKey: keyPair.toWIF(),
        publicKey: Buffer.from(keyPair.publicKey).toString('hex'),
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

      // Helper to convert hex to x-only pubkey (32 bytes)
      const toXOnly = (hex: string) => {
        const buf = Buffer.from(hex, 'hex');
        return buf.length === 32 ? buf : buf.subarray(1, 33);
      };

      const pk1 = toXOnly(pubkey1);
      const pk2 = toXOnly(pubkey2);

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

